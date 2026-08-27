//! Publishing what this machine has open, so a phone can pick it up.
//!
//! ## The shape of it
//!
//! One row per open document, keyed `(user_id, device_id, doc_id)`. The
//! markdown lives **in the row**: a ten-page document is 20–40KB, so an object
//! store would be machinery for nothing, and a single round trip is what makes
//! "tap it on the phone and read" feel immediate.
//!
//! A closed tab **deletes** its row. The list means "what is open now", so a
//! stale entry is worse than a missing one — you would tap a document you had
//! finished with and get a copy from two days ago.
//!
//! ## Every row carries `user_id`
//!
//! Row-level security checks `auth.uid() = user_id`; omitting it fails the NOT
//! NULL constraint and the policy at once. On wispr-fox's desktop that surfaced
//! as a misleading "Sync paused — will retry" banner rather than an error, and
//! cost real time. The `user_id` here comes from the token, never from the
//! frontend.

use serde::{Deserialize, Serialize};

use crate::auth;
use crate::supabase::{random_bytes, SUPABASE_ANON_KEY, SUPABASE_URL};

/// Documents larger than this sync their metadata only.
///
/// Not a guess at what Postgres can hold — a guard on what is sensible to put
/// in a row that a phone fetches over mobile data. Above it the phone still
/// lists the document and says it is too large to carry.
const MAX_CONTENT_BYTES: usize = 256 * 1024;

/// What the frontend hands us for each open tab.
#[derive(Debug, Clone, Deserialize)]
pub struct OpenTab {
    pub doc_id: String,
    pub path: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub notes_json: Option<String>,
    #[serde(default)]
    pub tab_index: i32,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub scroll: f32,
}

#[derive(Debug, Serialize)]
struct TabRow {
    user_id: String,
    device_id: String,
    doc_id: String,
    path: String,
    title: String,
    tab_index: i32,
    is_active: bool,
    content: String,
    notes_json: Option<String>,
    size_bytes: i32,
    oversize: bool,
    scroll: f32,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct DeviceRow {
    id: String,
    user_id: String,
    name: String,
    platform: String,
    fox_md_label: String,
    last_seen_at: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct PushResult {
    pub pushed: usize,
    pub removed: usize,
    pub oversize: usize,
    pub device_id: String,
}

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

/// This machine's stable id.
///
/// Generated once and kept in the Tauri store beside the settings. It must
/// survive restarts — a new id every launch would leave the phone showing the
/// same laptop half a dozen times, each with a stale tab list.
pub fn device_id(app: &tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("foxmd-device.json").map_err(|e| format!("device store: {e}"))?;
    if let Some(v) = store.get("device_id") {
        if let Some(s) = v.as_str() {
            if !s.is_empty() {
                return Ok(s.to_string());
            }
        }
    }
    // A UUID v4 by hand: 16 random bytes with the version and variant nibbles
    // pinned. Postgres's `uuid` column rejects anything else.
    let mut b = random_bytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let hex: String = b.iter().map(|x| format!("{x:02x}")).collect();
    let id = format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..32]
    );
    store.set("device_id", serde_json::Value::String(id.clone()));
    store.save().map_err(|e| format!("device store save: {e}"))?;
    Ok(id)
}

fn platform() -> &'static str {
    "desktop"
}

fn default_device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "This computer".to_string())
}

async fn user_id_from_token() -> Result<String, String> {
    // The `sub` claim of the access token. Read from the token rather than
    // asked for separately, so `user_id` on every row is exactly the identity
    // RLS will check it against.
    let token = auth::access_token().await?;
    let payload = token.split('.').nth(1).ok_or("malformed access token")?;
    let bytes = b64url_decode(payload)?;
    let json: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("malformed token payload: {e}"))?;
    json.get("sub")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "access token has no subject".to_string())
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

/// Announce this device, then replace its tab list with `tabs`.
pub async fn push(app: tauri::AppHandle, label: String, tabs: Vec<OpenTab>) -> Result<PushResult, String> {
    let token = auth::access_token().await?;
    let user_id = user_id_from_token().await?;
    let device_id = device_id(&app)?;
    let client = reqwest::Client::new();
    let stamp = now_iso();

    let name = if label.trim().is_empty() { default_device_name() } else { label.trim().to_string() };

    // 1. Upsert the device, so the phone has a name and a heartbeat even when
    //    nothing is open.
    let device = DeviceRow {
        id: device_id.clone(),
        user_id: user_id.clone(),
        name: name.clone(),
        platform: platform().to_string(),
        fox_md_label: name.clone(),
        last_seen_at: stamp.clone(),
    };
    let res = client
        .post(format!("{SUPABASE_URL}/rest/v1/devices?on_conflict=id"))
        .header("apikey", SUPABASE_ANON_KEY)
        .bearer_auth(&token)
        .header("Content-Type", "application/json")
        .header("Prefer", "resolution=merge-duplicates,return=minimal")
        .json(&[device])
        .send()
        .await
        .map_err(|e| format!("could not reach the sync service: {e}"))?;
    if !res.status().is_success() {
        let s = res.status();
        let b = res.text().await.unwrap_or_default();
        return Err(format!("device registration failed ({s}): {}", b.chars().take(180).collect::<String>()));
    }

    // 2. Upsert the open tabs.
    let mut oversize = 0usize;
    let rows: Vec<TabRow> = tabs
        .iter()
        .map(|t| {
            let big = t.content.len() > MAX_CONTENT_BYTES;
            if big {
                oversize += 1;
            }
            TabRow {
                user_id: user_id.clone(),
                device_id: device_id.clone(),
                doc_id: t.doc_id.clone(),
                path: t.path.clone(),
                title: t.title.clone(),
                tab_index: t.tab_index,
                is_active: t.is_active,
                content: if big { String::new() } else { t.content.clone() },
                notes_json: if big { None } else { t.notes_json.clone() },
                size_bytes: t.content.len() as i32,
                oversize: big,
                scroll: t.scroll,
                updated_at: stamp.clone(),
            }
        })
        .collect();

    if !rows.is_empty() {
        let res = client
            .post(format!("{SUPABASE_URL}/rest/v1/md_open_tabs?on_conflict=user_id,device_id,doc_id"))
            .header("apikey", SUPABASE_ANON_KEY)
            .bearer_auth(&token)
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates,return=minimal")
            .json(&rows)
            .send()
            .await
            .map_err(|e| format!("could not reach the sync service: {e}"))?;
        if !res.status().is_success() {
            let s = res.status();
            let b = res.text().await.unwrap_or_default();
            return Err(format!("publishing tabs failed ({s}): {}", b.chars().take(180).collect::<String>()));
        }
    }

    // 3. Delete rows for documents that are no longer open here.
    //
    //    Done as "not in the current set" rather than by tracking closes, so a
    //    crash or a missed event cannot leave a phantom tab on the phone
    //    forever. PostgREST wants the list as `not.in.(a,b,c)`.
    let removed = delete_missing(&client, &token, &user_id, &device_id, &tabs).await?;

    Ok(PushResult { pushed: rows.len(), removed, oversize, device_id })
}

async fn delete_missing(
    client: &reqwest::Client,
    token: &str,
    user_id: &str,
    device_id: &str,
    tabs: &[OpenTab],
) -> Result<usize, String> {
    let mut url = format!(
        "{SUPABASE_URL}/rest/v1/md_open_tabs?user_id=eq.{user_id}&device_id=eq.{device_id}"
    );
    if !tabs.is_empty() {
        // Quote each id: a doc_id is a hash, but quoting is what keeps a comma
        // or a parenthesis in a future id from splitting the filter.
        let list = tabs
            .iter()
            .map(|t| format!("\"{}\"", t.doc_id.replace('"', "")))
            .collect::<Vec<_>>()
            .join(",");
        url.push_str(&format!("&doc_id=not.in.({list})"));
    }
    let res = client
        .delete(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .bearer_auth(token)
        .header("Prefer", "return=representation")
        .send()
        .await
        .map_err(|e| format!("could not reach the sync service: {e}"))?;
    if !res.status().is_success() {
        return Ok(0); // Tidy-up failing must not fail the push.
    }
    let deleted: Vec<serde_json::Value> = res.json().await.unwrap_or_default();
    Ok(deleted.len())
}

/// Remove everything this device published. Used on sign-out.
pub async fn withdraw(app: tauri::AppHandle) -> Result<(), String> {
    let token = auth::access_token().await?;
    let user_id = user_id_from_token().await?;
    let device_id = device_id(&app)?;
    let _ = reqwest::Client::new()
        .delete(format!(
            "{SUPABASE_URL}/rest/v1/md_open_tabs?user_id=eq.{user_id}&device_id=eq.{device_id}"
        ))
        .header("apikey", SUPABASE_ANON_KEY)
        .bearer_auth(&token)
        .send()
        .await;
    Ok(())
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
