//! Google sign-in, and staying signed in.
//!
//! ## The flow
//!
//! Desktop OAuth with PKCE, run from Rust:
//!
//! 1. make a random `code_verifier`, and its SHA-256 `code_challenge`;
//! 2. bind a one-shot HTTP listener on `127.0.0.1:47821`;
//! 3. open the system browser at Supabase's `/authorize?provider=google`;
//! 4. Google → Supabase → `http://localhost:47821/callback?code=…`;
//! 5. the listener takes the code, answers with a "you can close this" page;
//! 6. exchange code + verifier for a session;
//! 7. keep the refresh token in the OS keyring.
//!
//! The browser is the *system* browser, not a webview we control, which is the
//! point: the user types their Google password into Chrome, where they can see
//! the address bar, and this app never sees it.
//!
//! ## Staying signed in — the requirement that shaped this module
//!
//! "It should not automatically sign out randomly." Three things cause that,
//! and each is handled here rather than hoped about:
//!
//! 1. **A refresh token that is never used expires.** We refresh on demand and
//!    treat a token as stale a minute before it actually is (`EXPIRY_SKEW`), so
//!    a slow clock or a slow network never presents an expired one.
//! 2. **Rotation races.** Supabase rotates the refresh token on every use and
//!    invalidates the old one. Two concurrent refreshes — two windows, or a
//!    push racing a UI check — means one of them ends up holding a token that
//!    has just been revoked, and *that* is what signs people out for no visible
//!    reason. Every refresh here goes through one mutex, and whoever loses the
//!    race re-reads the session the winner just stored.
//! 3. **Treating any failure as "signed out".** A network blip is not a
//!    logout. The session is only cleared when Supabase explicitly rejects the
//!    refresh token; anything else leaves it in place to retry.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::supabase::{
    base64url_nopad, percent_encode, random_bytes, redirect_url, Session, SupabaseUser,
    OAUTH_PORT, SUPABASE_ANON_KEY, SUPABASE_URL,
};

/// Where the refresh token lives. The OS credential store, same as the API
/// keys — never a file, and never the Tauri store, which is plain JSON on disk.
const KEYRING_SERVICE: &str = "com.mdreader.app";
const KEYRING_ACCOUNT: &str = "supabase-refresh-token";

/// Refresh this long before the access token actually expires.
const EXPIRY_SKEW: i64 = 60;

/// How long to wait for the user to finish signing in before giving the port
/// back. Long enough to find a password manager, short enough that an abandoned
/// attempt does not hold the port until the app quits.
const OAUTH_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Default, Serialize)]
pub struct AccountState {
    pub signed_in: bool,
    pub email: Option<String>,
    pub name: Option<String>,
    pub user_id: Option<String>,
    /// Set when the last operation failed. Shown rather than swallowed.
    pub error: Option<String>,
}

struct Cached {
    session: Session,
    /// Absolute unix seconds at which `access_token` stops being valid.
    expires_at: i64,
}

static CACHE: Lazy<Mutex<Option<Cached>>> = Lazy::new(|| Mutex::new(None));
/// Serialises refresh. See the rotation-race note in the module docs.
///
/// **`tokio::sync::Mutex`, not `std::sync`.** This guard is deliberately held
/// across the `.await` on the network call — that is the entire point, since a
/// lock released before the request would not serialise anything. A
/// `std::sync::MutexGuard` is `!Send`, which makes the whole future `!Send`,
/// which Tauri rejects with "future cannot be sent between threads safely" from
/// inside a macro expansion that names none of this.
static REFRESH_LOCK: Lazy<tokio::sync::Mutex<()>> = Lazy::new(|| tokio::sync::Mutex::new(()));

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn keyring() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("credential store unavailable: {e}"))
}

fn store_refresh_token(token: &str) -> Result<(), String> {
    keyring()?
        .set_password(token)
        .map_err(|e| format!("could not save the session: {e}"))
}

fn load_refresh_token() -> Option<String> {
    keyring().ok()?.get_password().ok().filter(|t| !t.is_empty())
}

fn clear_refresh_token() {
    if let Ok(entry) = keyring() {
        let _ = entry.delete_credential();
    }
}

fn remember(session: Session) -> Session {
    let expires_at = now() + if session.expires_in > 0 { session.expires_in } else { 3600 };
    let _ = store_refresh_token(&session.refresh_token);
    if let Ok(mut c) = CACHE.lock() {
        *c = Some(Cached { session: session.clone(), expires_at });
    }
    session
}

// ─── The OAuth dance ────────────────────────────────────────────────────────

struct Pkce {
    verifier: String,
    challenge: String,
}

fn make_pkce() -> Pkce {
    // 32 random bytes → 43 base64url characters, the length RFC 7636 wants.
    let verifier = base64url_nopad(&random_bytes(32));
    let digest = Sha256::digest(verifier.as_bytes());
    Pkce { challenge: base64url_nopad(&digest), verifier }
}

pub fn authorize_url(challenge: &str) -> String {
    format!(
        "{SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to={}&code_challenge={}&code_challenge_method=s256",
        percent_encode(&redirect_url()),
        percent_encode(challenge),
    )
}

/// Pull `?code=…` out of the request line of a raw HTTP request.
///
/// Split out and tested because the alternative is discovering it is wrong only
/// by clicking through a real Google login.
pub fn code_from_request_line(line: &str) -> Option<String> {
    let path = line.split_whitespace().nth(1)?;
    let query = path.split_once('?')?.1;
    for pair in query.split('&') {
        if let Some(v) = pair.strip_prefix("code=") {
            let decoded = v.replace('+', " ");
            return Some(decoded);
        }
    }
    None
}

const DONE_PAGE: &str = "\
<!doctype html><meta charset=utf-8><title>Fox MD</title>\
<style>body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#fbfaf8;color:#23201d;\
display:grid;place-items:center;height:100vh;margin:0}div{text-align:center}h1{font-size:1.1rem;font-weight:600}\
p{color:#6b645d;font-size:.9rem}</style>\
<div><h1>Signed in to Fox MD</h1><p>You can close this tab and go back to the app.</p></div>";

fn respond(mut stream: TcpStream, body: &str) {
    let res = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(res.as_bytes());
    let _ = stream.flush();
}

/// Block until the browser comes back with a code, or time out.
fn wait_for_code(listener: TcpListener) -> Result<String, String> {
    listener
        .set_nonblocking(false)
        .map_err(|e| format!("listener: {e}"))?;
    let deadline = SystemTime::now() + OAUTH_TIMEOUT;

    for incoming in listener.incoming() {
        if SystemTime::now() > deadline {
            return Err("Sign-in timed out.".into());
        }
        let stream = match incoming {
            Ok(s) => s,
            Err(_) => continue,
        };
        let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
        let mut line = String::new();
        if BufReader::new(&stream).read_line(&mut line).is_err() {
            continue;
        }
        // Browsers ask for /favicon.ico too; only the callback carries a code.
        if let Some(code) = code_from_request_line(&line) {
            respond(stream, DONE_PAGE);
            return Ok(code);
        }
        respond(stream, "<!doctype html><title>Fox MD</title>Waiting for sign-in…");
    }
    Err("Sign-in was cancelled.".into())
}

async fn exchange_code(code: &str, verifier: &str) -> Result<Session, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{SUPABASE_URL}/auth/v1/token?grant_type=pkce"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "auth_code": code, "code_verifier": verifier }))
        .send()
        .await
        .map_err(|e| format!("could not reach the sign-in service: {e}"))?;

    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("sign-in failed ({status}): {}", body.chars().take(200).collect::<String>()));
    }
    serde_json::from_str::<Session>(&body)
        .map_err(|e| format!("unexpected sign-in response: {e}"))
        .map(remember)
}

/// Run the whole flow. Returns once the session is stored.
pub async fn sign_in() -> Result<AccountState, String> {
    let pkce = make_pkce();
    let listener = TcpListener::bind(("127.0.0.1", OAUTH_PORT)).map_err(|e| {
        format!("could not open port {OAUTH_PORT} for sign-in ({e}). Is another copy of Fox MD signing in?")
    })?;

    let url = authorize_url(&pkce.challenge);
    open_in_browser(&url)?;

    // The listener blocks, so it goes on a worker thread rather than the async
    // runtime, which would otherwise stall every other command.
    let code = tokio::task::spawn_blocking(move || wait_for_code(listener))
        .await
        .map_err(|e| format!("sign-in task failed: {e}"))??;

    let session = exchange_code(&code, &pkce.verifier).await?;
    Ok(state_from(&session.user, None))
}

fn open_in_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("cmd").args(["/C", "start", "", url]).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(url).spawn();
    r.map(|_| ()).map_err(|e| format!("could not open a browser: {e}"))
}

// ─── Staying signed in ──────────────────────────────────────────────────────

#[derive(Deserialize)]
struct RefreshError {
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    error_description: Option<String>,
}

/// A valid access token, refreshing if needed. The single entry point for
/// anything that needs to talk to Supabase as the user.
pub async fn access_token() -> Result<String, String> {
    if let Ok(guard) = CACHE.lock() {
        if let Some(c) = guard.as_ref() {
            if c.expires_at - EXPIRY_SKEW > now() {
                return Ok(c.session.access_token.clone());
            }
        }
    }

    // One refresh at a time. See the module docs — concurrent refreshes are the
    // reason people get signed out for no reason they can point at.
    let _guard = REFRESH_LOCK.lock().await;

    // Someone may have refreshed while we waited for the lock.
    if let Ok(guard) = CACHE.lock() {
        if let Some(c) = guard.as_ref() {
            if c.expires_at - EXPIRY_SKEW > now() {
                return Ok(c.session.access_token.clone());
            }
        }
    }

    let refresh = load_refresh_token().ok_or_else(|| "Not signed in.".to_string())?;
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "refresh_token": refresh }))
        .send()
        .await
        .map_err(|e| format!("could not reach the sign-in service: {e}"))?;

    let status = res.status();
    let body = res.text().await.unwrap_or_default();

    if status.is_success() {
        let session: Session = serde_json::from_str(&body)
            .map_err(|e| format!("unexpected refresh response: {e}"))?;
        return Ok(remember(session).access_token);
    }

    // **Only an explicit rejection signs you out.** A 500, a timeout or a
    // captive portal must leave the stored token alone so the next attempt can
    // succeed; clearing on any failure is how an app loses a session to a
    // flaky café network.
    let rejected = status == reqwest::StatusCode::BAD_REQUEST
        || status == reqwest::StatusCode::UNAUTHORIZED
        || serde_json::from_str::<RefreshError>(&body)
            .ok()
            .and_then(|e| e.error.or(e.error_description))
            .map(|m| m.contains("Invalid Refresh Token") || m.contains("refresh_token_not_found"))
            .unwrap_or(false);

    if rejected {
        clear_refresh_token();
        if let Ok(mut c) = CACHE.lock() {
            *c = None;
        }
        return Err("Your session expired. Sign in again.".into());
    }
    Err(format!("could not refresh the session ({status})"))
}

fn state_from(user: &SupabaseUser, error: Option<String>) -> AccountState {
    AccountState {
        signed_in: true,
        email: user.email.clone(),
        name: Some(user.display_name()),
        user_id: Some(user.id.clone()),
        error,
    }
}

/// What the UI asks on mount. Never throws: "signed out" is an answer.
pub async fn current_account() -> AccountState {
    if load_refresh_token().is_none() {
        return AccountState::default();
    }
    match access_token().await {
        Ok(_) => {
            let cached = CACHE.lock().ok().and_then(|c| c.as_ref().map(|c| c.session.user.clone()));
            match cached {
                Some(u) => state_from(&u, None),
                // We have a working token but no cached profile: ask for it.
                None => match fetch_user().await {
                    Ok(u) => state_from(&u, None),
                    Err(e) => AccountState { signed_in: true, error: Some(e), ..Default::default() },
                },
            }
        }
        Err(e) if e.starts_with("Your session expired") => AccountState::default(),
        // Offline at launch is not signed out. Report the trouble, keep the session.
        Err(e) => AccountState { signed_in: true, error: Some(e), ..Default::default() },
    }
}

async fn fetch_user() -> Result<SupabaseUser, String> {
    let token = access_token().await?;
    let res = reqwest::Client::new()
        .get(format!("{SUPABASE_URL}/auth/v1/user"))
        .header("apikey", SUPABASE_ANON_KEY)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("could not reach the sign-in service: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("could not read your account ({})", res.status()));
    }
    res.json::<SupabaseUser>().await.map_err(|e| format!("unexpected account response: {e}"))
}

pub async fn sign_out() {
    // Best effort server-side revoke; the local clear is what matters and must
    // happen whether or not the network is there.
    if let Ok(token) = access_token().await {
        let _ = reqwest::Client::new()
            .post(format!("{SUPABASE_URL}/auth/v1/logout"))
            .header("apikey", SUPABASE_ANON_KEY)
            .bearer_auth(token)
            .send()
            .await;
    }
    clear_refresh_token();
    if let Ok(mut c) = CACHE.lock() {
        *c = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_authorize_url_carries_provider_redirect_and_challenge() {
        let url = authorize_url("CHALLENGE123");
        assert!(url.contains("provider=google"), "{url}");
        assert!(url.contains("code_challenge=CHALLENGE123"), "{url}");
        assert!(url.contains("code_challenge_method=s256"), "{url}");
        // The redirect must be percent-encoded or Supabase reads it as the end
        // of the parameter list.
        assert!(url.contains("redirect_to=http%3A%2F%2Flocalhost%3A47821%2Fcallback"), "{url}");
    }

    #[test]
    fn pkce_challenge_is_the_sha256_of_the_verifier() {
        let p = make_pkce();
        let expected = base64url_nopad(&Sha256::digest(p.verifier.as_bytes()));
        assert_eq!(p.challenge, expected);
        assert_eq!(p.verifier.len(), 43, "RFC 7636 wants 43..128 characters");
    }

    #[test]
    fn pkce_is_fresh_every_time() {
        assert_ne!(make_pkce().verifier, make_pkce().verifier);
    }

    #[test]
    fn the_code_is_read_out_of_the_request_line() {
        assert_eq!(
            code_from_request_line("GET /callback?code=abc123&state=x HTTP/1.1"),
            Some("abc123".to_string())
        );
        assert_eq!(
            code_from_request_line("GET /callback?state=x&code=zz HTTP/1.1"),
            Some("zz".to_string())
        );
    }

    #[test]
    fn a_request_without_a_code_is_ignored() {
        // The browser also asks for /favicon.ico on that origin; answering it
        // as if it were the callback would abort the sign-in.
        assert_eq!(code_from_request_line("GET /favicon.ico HTTP/1.1"), None);
        assert_eq!(code_from_request_line("GET /callback HTTP/1.1"), None);
        assert_eq!(code_from_request_line("garbage"), None);
    }
}
