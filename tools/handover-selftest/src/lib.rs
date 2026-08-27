// GENERATED - do not edit. Run `extract.py` instead.
//
// Every line below was sliced out of ../../src-tauri/src/{{supabase,auth,handover}}.rs,
// so a passing `cargo test` here is evidence about the code the app actually
// ships rather than about a copy of it.

pub mod supabase {
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

}

pub mod auth {
use super::supabase::*;
use sha2::{Digest, Sha256};
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

}

pub mod handover {
fn now_iso() -> String {
    // RFC 3339 with a Z. Postgres accepts it for `timestamptz` and it sorts
    // lexicographically, which the phone relies on for "most recent first".
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Days → civil date, so this needs no chrono. Algorithm is Howard Hinnant's
    // days_from_civil, run backwards.
    let days = (secs / 86_400) as i64;
    let rem = (secs % 86_400) as i64;
    let (y, m, d) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y, m, d, rem / 3600, (rem % 3600) / 60, rem % 60
    )
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn b64url_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let mut acc: u32 = 0;
    let mut bits = 0u32;
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'-' => 62,
            b'_' => 63,
            b'=' => continue,
            _ => return Err("bad base64url in token".into()),
        } as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamps_are_rfc3339_and_sortable() {
        let s = now_iso();
        assert_eq!(s.len(), 20, "{s}");
        assert!(s.ends_with('Z'), "{s}");
        assert_eq!(&s[4..5], "-");
        assert_eq!(&s[10..11], "T");
        // Lexicographic order must match chronological order; the phone sorts
        // "most recent device first" on this string.
        assert!("2026-08-28T00:00:00Z" < "2026-08-28T00:00:01Z");
        assert!("2026-08-28T23:59:59Z" < "2026-08-29T00:00:00Z");
    }

    #[test]
    fn the_civil_date_conversion_is_right_at_known_points() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_000), (2022, 1, 8));
        // Both sides of a leap day, which is where a hand-rolled calendar goes
        // wrong — and where an off-by-one hides until the following March.
        assert_eq!(civil_from_days(18_320), (2020, 2, 28));
        assert_eq!(civil_from_days(18_321), (2020, 2, 29));
        assert_eq!(civil_from_days(18_322), (2020, 3, 1));
        // A century that is not a leap year, the other classic.
        assert_eq!(civil_from_days(11_016), (2000, 2, 29));
    }

    #[test]
    fn base64url_decode_reads_a_jwt_payload() {
        // {"sub":"abc"} — no padding, as JWTs are.
        let decoded = b64url_decode("eyJzdWIiOiJhYmMifQ").unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), r#"{"sub":"abc"}"#);
    }

    #[test]
    fn base64url_decode_accepts_the_url_safe_alphabet() {
        // '-' and '_' must decode; a standard-base64 decoder would reject them
        // and every token with those bytes would fail to parse.
        assert!(b64url_decode("a-b_c").is_ok());
        assert!(b64url_decode("!!!").is_err());
    }
}

}
