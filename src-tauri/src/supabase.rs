//! Shared Supabase plumbing: where the project is, and the small primitives
//! the auth and handover modules both need.
//!
//! ## Why every byte of this lives in Rust and not in the webview
//!
//! `@supabase/supabase-js` would handle PKCE, refresh and storage for us, and
//! for most apps that is the right answer. It is the wrong answer *here*:
//!
//! Fox MD renders arbitrary markdown from disk with raw HTML enabled
//! (`unsafe_` in `markdown.rs`). The strict CSP with no external `connect-src`
//! is what stops a crafted document from talking to the network. Putting the
//! session in the webview would mean widening that CSP to the Supabase origin —
//! and then any document you opened could reach the API *with your session
//! attached*. The updater already made this call for the same reason; auth is
//! the case where it matters most.
//!
//! So the webview never sees a token. It asks Rust "am I signed in?" and gets
//! back a name and an email.

use serde::{Deserialize, Serialize};

/// The project. The anon key is **publishable** — it grants nothing on its own;
/// row-level security scoped to `auth.uid()` is what protects the data. It is
/// the same project wispr-fox uses, deliberately: the owner asked for one login
/// across his apps, and `auth.users` and `public.devices` already live there.
pub const SUPABASE_URL: &str = "https://hvaljemiwuhnohrndyyh.supabase.co";
pub const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2YWxqZW1pd3Vobm9ocm5keXloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMjI1MDAsImV4cCI6MjA5OTY5ODUwMH0.kOu8wVU1XqGOooAShVCQtkr6IIxcdeBujuyUiajMOBc";

/// Fixed, so the redirect URL you allow-list in the Supabase dashboard is a
/// constant rather than a wildcard.
///
/// A random free port would need `http://localhost:*` allowed, which widens the
/// allow-list for every app on the machine that can bind a port. One known port
/// is a smaller thing to trust.
pub const OAUTH_PORT: u16 = 47821;

pub fn redirect_url() -> String {
    format!("http://localhost:{OAUTH_PORT}/callback")
}

/// A signed-in session, as Supabase returns it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub access_token: String,
    pub refresh_token: String,
    /// Seconds from issue. Converted to an absolute deadline on receipt.
    #[serde(default)]
    pub expires_in: i64,
    #[serde(default)]
    pub user: SupabaseUser,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SupabaseUser {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub user_metadata: UserMetadata,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UserMetadata {
    #[serde(default)]
    pub full_name: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

impl SupabaseUser {
    pub fn display_name(&self) -> String {
        self.user_metadata
            .full_name
            .clone()
            .or_else(|| self.user_metadata.name.clone())
            .or_else(|| self.email.clone())
            .unwrap_or_else(|| "Signed in".to_string())
    }
}

/// Percent-encode for a query string.
///
/// Hand-rolled rather than pulling in `urlencoding` for one function. The
/// unreserved set is RFC 3986's; everything else is escaped, which is stricter
/// than necessary and never wrong.
pub fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

const B64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// base64url **without padding** — what RFC 7636 requires for a PKCE
/// `code_challenge`. Padding characters make Supabase reject the challenge with
/// a generic "invalid request", which is a miserable thing to debug.
pub fn base64url_nopad(bytes: &[u8]) -> String {
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(B64URL[(n >> 18) as usize & 63] as char);
        out.push(B64URL[(n >> 12) as usize & 63] as char);
        if chunk.len() > 1 {
            out.push(B64URL[(n >> 6) as usize & 63] as char);
        }
        if chunk.len() > 2 {
            out.push(B64URL[n as usize & 63] as char);
        }
    }
    out
}

/// Cryptographically random bytes, for the PKCE verifier and the device id.
pub fn random_bytes(n: usize) -> Vec<u8> {
    let mut buf = vec![0u8; n];
    getrandom::getrandom(&mut buf).expect("the OS must be able to produce randomness");
    buf
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64url_has_no_padding_and_no_plus_or_slash() {
        // The bytes 0xFB 0xFF encode to "-_8" in base64url and "+/8=" in
        // standard base64; getting this wrong is the classic PKCE failure.
        let s = base64url_nopad(&[0xFB, 0xFF, 0xFF]);
        assert!(!s.contains('='), "padding must be stripped: {s}");
        assert!(!s.contains('+') && !s.contains('/'), "must be url-safe: {s}");
        assert_eq!(s, "-___");
    }

    #[test]
    fn base64url_handles_every_tail_length() {
        assert_eq!(base64url_nopad(b"a").len(), 2);
        assert_eq!(base64url_nopad(b"ab").len(), 3);
        assert_eq!(base64url_nopad(b"abc").len(), 4);
    }

    #[test]
    fn percent_encoding_escapes_what_a_redirect_url_contains() {
        assert_eq!(percent_encode("http://localhost:47821/callback"),
                   "http%3A%2F%2Flocalhost%3A47821%2Fcallback");
        assert_eq!(percent_encode("a~b-c_d.e"), "a~b-c_d.e");
    }

    #[test]
    fn random_bytes_are_not_constant() {
        assert_ne!(random_bytes(32), random_bytes(32));
    }
}
