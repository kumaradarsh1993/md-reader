// GENERATED — do not edit. Run `extract.py` instead.
//
// Every line below was sliced out of ../../src-tauri/src/updates.rs, so a
// passing `cargo test` here is evidence about the code the app actually ships,
// not about a copy of it. See extract.py for why this indirection exists.
//
// Only the pure logic is extracted, so the parts of it the app calls from the
// download path have no caller here. That is expected, not rot.
#![allow(dead_code)]

use serde::Deserialize;

const ALLOWED_HOSTS: [&str; 3] = [
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

pub fn version_is_newer(current: &str, candidate: &str) -> bool {
    use std::cmp::Ordering;

    fn parts(v: &str) -> (Vec<u32>, &str) {
        let v = v.trim().trim_start_matches('v');
        let (head, tail) = v.split_once('-').unwrap_or((v, ""));
        let nums: Vec<u32> = head.split('.').filter_map(|s| s.parse().ok()).collect();
        (nums, tail)
    }

    fn compare_prerelease(a: &str, b: &str) -> Ordering {
        // Empty means "not a pre-release", which outranks any pre-release.
        match (a.is_empty(), b.is_empty()) {
            (true, true) => return Ordering::Equal,
            (true, false) => return Ordering::Greater,
            (false, true) => return Ordering::Less,
            (false, false) => {}
        }
        let mut aa = a.split('.');
        let mut bb = b.split('.');
        loop {
            match (aa.next(), bb.next()) {
                (None, None) => return Ordering::Equal,
                (None, Some(_)) => return Ordering::Less,
                (Some(_), None) => return Ordering::Greater,
                (Some(x), Some(y)) => {
                    let ord = match (x.parse::<u32>(), y.parse::<u32>()) {
                        (Ok(xn), Ok(yn)) => xn.cmp(&yn),
                        _ => x.cmp(y),
                    };
                    if ord != Ordering::Equal {
                        return ord;
                    }
                }
            }
        }
    }

    let (cur_nums, cur_pre) = parts(current);
    let (can_nums, can_pre) = parts(candidate);
    for i in 0..cur_nums.len().max(can_nums.len()) {
        let a = can_nums.get(i).copied().unwrap_or(0);
        let b = cur_nums.get(i).copied().unwrap_or(0);
        match a.cmp(&b) {
            Ordering::Greater => return true,
            Ordering::Less => return false,
            Ordering::Equal => {}
        }
    }
    compare_prerelease(can_pre, cur_pre) == Ordering::Greater
}

fn wanted_suffixes() -> &'static [&'static str] {
    #[cfg(target_os = "windows")]
    {
        &["x64-setup.exe", "-setup.exe", ".msi"]
    }
    #[cfg(target_os = "macos")]
    {
        &["universal.dmg", "aarch64.dmg", ".dmg"]
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        &[".appimage", ".deb"]
    }
}

/// Windows is the only platform where the installer can be handed to the OS and
/// complete on its own. macOS needs a drag out of a `.dmg` (and these builds are
/// not notarised); a Linux AppImage has nothing to install in the first place.
pub fn can_self_install() -> bool {
    cfg!(target_os = "windows")
}

fn pick_asset(assets: &[GhAsset]) -> Option<&GhAsset> {
    for suffix in wanted_suffixes() {
        if let Some(a) = assets
            .iter()
            .find(|a| a.name.to_ascii_lowercase().ends_with(suffix))
        {
            return Some(a);
        }
    }
    None
}

/// First meaningful line of the release notes — skips the markdown heading,
/// blockquotes and blank lines so the UI gets a sentence, not a `#`.
fn summarize(body: Option<&str>) -> Option<String> {
    let body = body?;
    for raw in body.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with("> ") {
            continue;
        }
        let cleaned = line.trim_start_matches(['*', '-', ' ']).replace("**", "");
        if cleaned.chars().count() < 3 {
            continue;
        }
        return Some(cleaned.chars().take(180).collect());
    }
    None
}

fn host_allowed(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    parsed
        .host_str()
        .map(|h| {
            let h = h.to_ascii_lowercase();
            ALLOWED_HOSTS
                .iter()
                .any(|a| h == *a || h.ends_with(&format!(".{a}")))
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_compares_numerically_not_lexically() {
        assert!(version_is_newer("3.4.0", "3.10.0"));
        assert!(!version_is_newer("3.10.0", "3.4.0"));
        assert!(version_is_newer("1.4.0", "1.5.0"));
        assert!(!version_is_newer("1.5.0", "1.5.0"));
    }

    /// The one every naive implementation gets wrong: `nightly.10` sorts BELOW
    /// `nightly.9` as a string, and these repos routinely pass nightly.9.
    #[test]
    fn nightly_ordinals_compare_as_numbers() {
        assert!(version_is_newer("3.4.0-nightly.9", "3.4.0-nightly.10"));
        assert!(!version_is_newer("3.4.0-nightly.10", "3.4.0-nightly.9"));
    }

    /// Semver's rule, and the reason the stable card never offers a downgrade:
    /// a released 3.4.0 is newer than every 3.4.0 nightly that preceded it.
    #[test]
    fn a_release_outranks_its_own_prereleases() {
        assert!(version_is_newer("3.4.0-nightly.2", "3.4.0"));
        assert!(!version_is_newer("3.4.0", "3.4.0-nightly.2"));
        assert!(version_is_newer("3.3.0", "3.4.0-nightly.1"));
    }

    #[test]
    fn leading_v_is_tolerated_on_either_side() {
        assert!(version_is_newer("v0.9.0", "v0.10.0"));
        assert!(!version_is_newer("0.10.0", "v0.9.0"));
    }

    /// Only GitHub's own hosts, and only over HTTPS. This is the check that
    /// stops a tampered or spoofed API response pointing a download somewhere
    /// arbitrary, so it is worth pinning precisely.
    #[test]
    fn host_allowlist_accepts_github_and_rejects_lookalikes() {
        assert!(host_allowed(
            "https://github.com/kumaradarsh1993/wispr-fox/releases/download/v1/a.exe"
        ));
        assert!(host_allowed("https://objects.githubusercontent.com/x"));
        assert!(host_allowed("https://release-assets.githubusercontent.com/y"));
        assert!(host_allowed("https://cdn.objects.githubusercontent.com/z"));

        assert!(!host_allowed("http://github.com/a.exe"));
        assert!(!host_allowed("https://github.com.evil.test/a.exe"));
        assert!(!host_allowed("https://notgithub.com/a.exe"));
        assert!(!host_allowed("https://evilobjects.githubusercontent.com.bad/z"));
        assert!(!host_allowed("a.exe"));
    }

    fn asset(name: &str) -> GhAsset {
        GhAsset {
            name: name.into(),
            browser_download_url: format!("https://github.com/x/y/releases/download/v1/{name}"),
            size: 1,
        }
    }

    /// The real artifact names all four repos publish today. If a picker change
    /// stops matching one of these, that app's Install button silently degrades
    /// to "no installer for this platform" — which is why they are pinned here
    /// verbatim rather than described.
    #[test]
    fn every_repos_real_artifact_set_yields_an_installer() {
        let sets: [&[&str]; 4] = [
            &[
                "wispr-fox-3.4.0-nightly.2-1.x86_64.rpm",
                "wispr-fox_3.4.0-nightly.2_aarch64.dmg",
                "wispr-fox_3.4.0-nightly.2_amd64.AppImage",
                "wispr-fox_3.4.0-nightly.2_amd64.deb",
                "wispr-fox_3.4.0-nightly.2_x64-setup.exe",
            ],
            &[
                "FoxCull_1.5.0-nightly.5_aarch64.dmg",
                "FoxCull_1.5.0-nightly.5_amd64.AppImage",
                "FoxCull_1.5.0-nightly.5_amd64.deb",
                "FoxCull_1.5.0-nightly.5_x64-setup.exe",
                "foxcull_1.5.0-nightly.5_x64_portable.zip",
            ],
            &[
                "fox-mark_0.5.0-nightly.1_x64_portable.zip",
                "Fox.Mark_0.5.0-nightly.1_aarch64.dmg",
                "Fox.Mark_0.5.0-nightly.1_amd64.AppImage",
                "Fox.Mark_0.5.0-nightly.1_amd64.deb",
                "Fox.Mark_0.5.0-nightly.1_x64-setup.exe",
            ],
            &[
                "Fox.MD-0.9.0-1.x86_64.rpm",
                "Fox.MD_0.9.0_amd64.AppImage",
                "Fox.MD_0.9.0_amd64.deb",
                "Fox.MD_0.9.0_universal.dmg",
                "Fox.MD_0.9.0_x64-setup.exe",
                "Fox.MD_0.9.0_x64_en-US.msi",
            ],
        ];
        for names in sets {
            let assets: Vec<GhAsset> = names.iter().map(|n| asset(n)).collect();
            let picked = pick_asset(&assets)
                .unwrap_or_else(|| panic!("no installer picked from {names:?}"));
            // Never the portable zip or the .app.tar.gz — those are not installers.
            assert!(!picked.name.ends_with(".zip"), "picked a zip: {}", picked.name);
        }
    }

    /// Windows must prefer NSIS over MSI: only the NSIS switch pair (/S /R)
    /// installs silently AND relaunches, which is the entire one-click promise.
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_prefers_the_nsis_setup_over_the_msi() {
        let assets = vec![
            asset("Fox.MD_0.9.0_x64_en-US.msi"),
            asset("Fox.MD_0.9.0_x64-setup.exe"),
        ];
        assert_eq!(pick_asset(&assets).unwrap().name, "Fox.MD_0.9.0_x64-setup.exe");
    }

    #[test]
    fn no_installer_for_this_platform_is_none_not_a_wrong_guess() {
        let assets = vec![asset("something_x64_portable.zip"), asset("source.tar.gz")];
        assert!(pick_asset(&assets).is_none());
    }

    #[test]
    fn summarize_skips_headings_bullets_and_blank_lines() {
        let body = "# v3.4.0\n\n> Stable release\n\n**Your devices, as one account.** Insights merges.\n";
        assert_eq!(
            summarize(Some(body)).as_deref(),
            Some("Your devices, as one account. Insights merges.")
        );
        assert_eq!(
            summarize(Some("## What\n- **Fixed** the thing\n")).as_deref(),
            Some("Fixed the thing")
        );
        assert_eq!(summarize(Some("#only a heading")), None);
        assert_eq!(summarize(None), None);
    }
}

