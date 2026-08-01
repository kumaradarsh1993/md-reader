use keyring::{Entry, Error};
use once_cell::sync::Lazy;
use parking_lot::Mutex;

// Keep the service identifier stable across the md-reader -> Fox MD rename so
// existing credentials continue to resolve after the update.
const SERVICE: &str = "com.mdreader.app";

// Windows Credential Manager does not guarantee ordering for concurrent
// access. Torn-out windows are separate processes, but serialising calls in
// each process still prevents ordinary frontend requests from racing.
static KEYRING_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

fn username(provider: &str) -> Result<&'static str, String> {
    match provider {
        "groq" => Ok("groq-api-key"),
        "anthropic" => Ok("anthropic-api-key"),
        _ => Err("unsupported secret provider".to_string()),
    }
}

fn entry(provider: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, username(provider)?).map_err(|e| format!("keyring unavailable: {e}"))
}

fn get_secret_inner(provider: &str) -> Result<Option<String>, String> {
    let _guard = KEYRING_LOCK.lock();
    match entry(provider)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring read failed: {e}")),
    }
}

fn set_secret_inner(provider: &str, value: &str) -> Result<(), String> {
    let _guard = KEYRING_LOCK.lock();
    let entry = entry(provider)?;
    if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("keyring delete failed: {e}")),
        }
    } else {
        entry
            .set_password(value)
            .map_err(|e| format!("keyring write failed: {e}"))
    }
}

#[tauri::command]
pub async fn get_secret(provider: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || get_secret_inner(&provider))
        .await
        .map_err(|e| format!("keyring task failed: {e}"))?
}

#[tauri::command]
pub async fn set_secret(provider: String, value: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_secret_inner(&provider, &value))
        .await
        .map_err(|e| format!("keyring task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::username;

    #[test]
    fn only_known_providers_can_address_the_keyring() {
        assert_eq!(username("groq").unwrap(), "groq-api-key");
        assert_eq!(username("anthropic").unwrap(), "anthropic-api-key");
        assert!(username("arbitrary").is_err());
    }
}
