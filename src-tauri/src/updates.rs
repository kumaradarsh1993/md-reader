//! In-app update check and install.
//!
//! Deliberately **not** `tauri-plugin-updater`. That plugin wants a signed
//! `latest.json` manifest and a keypair whose private half has to live in CI
//! secrets; this app ships unsigned builds from a public repo, so the whole
//! signing apparatus would buy nothing here and cost a key-management story.
//! Instead this reads the repo's public releases straight from the GitHub API
//! and runs the platform installer.
//!
//! Two consequences worth knowing:
//!
//!  - **Nightlies must be published pre-releases, not drafts.** GitHub does not
//!    return draft releases to an unauthenticated caller, so a draft nightly is
//!    invisible here. `.github/workflows/release.yml` publishes any tag
//!    containing `-nightly` as a pre-release for exactly this reason.
//!  - **The network call lives in Rust, not the webview.** The app runs a
//!    strict CSP with no `connect-src` for external hosts, and opening one up
//!    to reach api.github.com would widen the attack surface of every page the
//!    renderer touches. Rust does the fetch; the frontend only sees the result.
//!
//! v0.9.0+.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const REPO: &str = "kumaradarsh1993/md-reader";
/// GitHub requires a User-Agent on every API request and 403s without one.
const UA: &str = concat!("FoxMD/", env!("CARGO_PKG_VERSION"), " (+https://github.com/kumaradarsh1993/md-reader)");
/// One page is plenty: releases come back newest-first, and a build older than
/// the last 30 is not something anyone is updating *to*.
const RELEASES_URL: &str = "https://api.github.com/repos/kumaradarsh1993/md-reader/releases?per_page=30";

#[derive(Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    name: Option<String>,
    draft: bool,
    prerelease: bool,
    published_at: Option<String>,
    html_url: String,
    #[serde(default)]
    assets: Vec<GhAsset>,
}

/// One release, reduced to what the Settings panel needs to render a row.
#[derive(Serialize, Clone)]
pub struct ReleaseInfo {
    pub tag: String,
    pub name: String,
    pub prerelease: bool,
    /// RFC-3339, straight from GitHub. The frontend formats it — a relative
    /// time computed here would be stale the moment it crossed the IPC.
    pub published_at: Option<String>,
    pub html_url: String,
    /// The installer for *this* platform. `None` when a release predates the
    /// current platform's artifacts, which is why the UI must handle it.
    pub asset_name: Option<String>,
    pub asset_url: Option<String>,
    pub asset_size: Option<u64>,
}

#[derive(Serialize)]
pub struct UpdateStatus {
    pub current: String,
    pub stable: Option<ReleaseInfo>,
    pub nightly: Option<ReleaseInfo>,
    /// Present when the check itself failed — the UI shows this rather than
    /// silently pretending there is no update.
    pub error: Option<String>,
    pub releases_url: String,
}

/// Pick the installer this platform can actually run.
///
/// Windows gets the NSIS `.exe` rather than the `.msi` because only the NSIS
/// installer supports a silent in-place update; macOS gets the universal
/// `.dmg`; Linux gets the portable AppImage, which needs no package manager.
fn pick_asset(assets: &[GhAsset]) -> Option<&GhAsset> {
    #[cfg(windows)]
    let wanted: &[&str] = &["-setup.exe", ".msi"];
    #[cfg(target_os = "macos")]
    let wanted: &[&str] = &[".dmg"];
    #[cfg(all(unix, not(target_os = "macos")))]
    let wanted: &[&str] = &[".AppImage", ".deb"];

    for suffix in wanted {
        if let Some(a) = assets
            .iter()
            .find(|a| a.name.to_lowercase().ends_with(&suffix.to_lowercase()))
        {
            return Some(a);
        }
    }
    None
}

fn to_info(r: &GhRelease) -> ReleaseInfo {
    let asset = pick_asset(&r.assets);
    ReleaseInfo {
        tag: r.tag_name.clone(),
        name: r.name.clone().unwrap_or_else(|| r.tag_name.clone()),
        prerelease: r.prerelease,
        published_at: r.published_at.clone(),
        html_url: r.html_url.clone(),
        asset_name: asset.map(|a| a.name.clone()),
        asset_url: asset.map(|a| a.browser_download_url.clone()),
        asset_size: asset.map(|a| a.size),
    }
}

/// Newest stable and newest nightly, alongside the running version.
///
/// Never returns `Err` for a network failure: a settings panel that renders
/// nothing because GitHub was unreachable is worse than one that says so.
/// The `error` field carries that.
#[tauri::command]
pub async fn check_updates() -> UpdateStatus {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let releases_url = format!("https://github.com/{REPO}/releases");

    let fetched: Result<Vec<GhRelease>, String> = async {
        let client = reqwest::Client::builder()
            .user_agent(UA)
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client
            .get(RELEASES_URL)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| format!("could not reach GitHub: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("GitHub returned {}", resp.status()));
        }
        resp.json::<Vec<GhRelease>>()
            .await
            .map_err(|e| format!("unexpected response: {e}"))
    }
    .await;

    match fetched {
        Err(e) => UpdateStatus {
            current,
            stable: None,
            nightly: None,
            error: Some(e),
            releases_url,
        },
        Ok(list) => {
            // Drafts are filtered defensively: an authenticated token in the
            // environment would make them visible, and a draft has no public
            // download URL, so offering one would produce a 404 on install.
            let visible: Vec<&GhRelease> = list.iter().filter(|r| !r.draft).collect();
            let stable = visible.iter().find(|r| !r.prerelease).map(|r| to_info(r));
            let nightly = visible.iter().find(|r| r.prerelease).map(|r| to_info(r));
            UpdateStatus {
                current,
                stable,
                nightly,
                error: None,
                releases_url,
            }
        }
    }
}

/// Where a downloaded installer lands. Named per release so two downloads of
/// different versions don't collide, and so a half-written file from a failed
/// attempt is replaced rather than appended to.
fn download_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(name)
}

/// Download the installer for `url` and hand it to the OS.
///
/// Windows: runs the NSIS installer with `/S` (silent) and `/R` (relaunch the
/// app afterwards), then quits this process a beat later — the installer cannot
/// replace an executable that is still running, and NSIS will otherwise sit
/// waiting on a locked file.
///
/// macOS / Linux: there is no equivalent unattended path for a `.dmg` (it has
/// to be mounted and dragged) or an AppImage (there is nothing to install), so
/// the file is downloaded and opened, which is as far as an app can honestly
/// take it.
#[tauri::command]
pub async fn install_update(app: AppHandle, url: String, name: String) -> Result<String, String> {
    if !url.starts_with("https://github.com/") && !url.starts_with("https://objects.githubusercontent.com/") {
        // The URL always comes from our own check_updates response; this is a
        // guard against a compromised renderer asking us to run something else.
        return Err("refusing to download from an unexpected host".into());
    }

    let client = reqwest::Client::builder()
        .user_agent(UA)
        .build()
        .map_err(|e| e.to_string())?;
    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("download failed: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("download failed: {e}"))?;

    let path = download_path(&name);
    std::fs::write(&path, &bytes).map_err(|e| format!("could not save the installer: {e}"))?;

    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new(&path);
        // /S = silent, /R = restart the app when the install finishes. Both are
        // handled by Tauri's NSIS template; an unrecognised switch is ignored,
        // so this stays safe if the template changes.
        cmd.arg("/S").arg("/R");
        cmd.spawn()
            .map_err(|e| format!("could not start the installer: {e}"))?;

        // Give the installer a moment to take its own lock, then get out of the
        // way. Quitting immediately races it; not quitting at all deadlocks it.
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
            handle.exit(0);
        });
        return Ok(format!("Installing {name} — Fox MD will close and reopen."));
    }

    #[cfg(not(windows))]
    {
        let _ = &app;
        // Plain OS launchers rather than the opener plugin's Rust API: this
        // branch never compiles on the Windows dev machine, so an API guess
        // here would only surface as a CI failure on mac/linux twenty minutes
        // later. `open` and `xdg-open` are stable interfaces that predate this
        // app by decades.
        #[cfg(target_os = "macos")]
        let launcher = "open";
        #[cfg(all(unix, not(target_os = "macos")))]
        let launcher = "xdg-open";

        std::process::Command::new(launcher)
            .arg(&path)
            .spawn()
            .map_err(|e| format!("downloaded, but could not open {}: {e}", path.display()))?;
        Ok(format!(
            "Downloaded {name} — finish the install from the file that just opened."
        ))
    }
}
