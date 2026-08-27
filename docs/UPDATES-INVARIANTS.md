# Before you change the updater — four things that fail quietly

> Written 2026-08-28, after putting this module into all four Fox desktop apps
> in one pass. [`UPDATES.md`](UPDATES.md) describes what the module does; this
> lists what will bite the next person who edits it. Every item here was a real
> failure, not a hypothetical.
>
> Reviewed at the same time: the Android port. See
> `md-reader-android/docs/UPDATER-REVIEW-2026-08-28.md`.

## 1. Fox MD stamps two different versions in CI, and it has to

`release.yml` writes the **full** tag version (`0.10.0-nightly.5`) into
`src-tauri/Cargo.toml`, and a **WiX-legal** one (`0.10.0-5`) into
`tauri.conf.json` and `package.json`. This looks like an inconsistency to tidy
up. It is not.

- `Cargo.toml` drives `CARGO_PKG_VERSION`, which is what the updater reports as
  the running build. Stamp `0.10.0` there and a nightly.3 will never see
  nightly.4, because semver ranks a plain `0.10.0` **above** `0.10.0-nightly.4`.
  The app then says "you're up to date" forever — indistinguishable from there
  genuinely being nothing newer.
- `tauri.conf.json` feeds the bundlers, and Fox MD is the only one of the four
  that ships an `.msi`. MSI refuses a non-numeric pre-release: *"optional
  pre-release identifier in app version must be numeric-only"*. Stamping the
  full version there fails **only** the Windows job while macOS and Linux pass —
  which publishes a release that looks complete and has no Windows installer.

Both halves are commented at length in `release.yml`. Keep the ordinal
(`0.10.0-5`, not bare `0.10.0`) so two nightlies never produce identically-named
installers.

## 2. `UpdatePanel.svelte` has no hard-coded repo URL, deliberately

The "All releases" button is disabled until `status` arrives, and takes its URL
from `status.releases_url` — which Rust builds from the `REPO` constant it
already owns.

An obvious-looking improvement is a fallback literal so the button works before
the check returns. Don't: that literal would be the one thing in the file that
differs per app, the parity checker would start permitting a difference, and a
wrong one would send you to another app's releases page with no error. This was
in the file once and was removed for exactly that reason.

## 3. Run both checks, not just `cargo check`

```
D:/Python312/python.exe tools/check-updater-parity.py
D:/Python312/python.exe tools/updates-selftest/extract.py && cargo test --manifest-path tools/updates-selftest/Cargo.toml
```

The selftest **slices the real `updates.rs`** rather than restating it, because
a Tauri crate's own test binary cannot launch on this machine (it links
WebView2 → `STATUS_ENTRYPOINT_NOT_FOUND`). If you move or rename a function it
brackets, `extract.py` fails loudly — fix the slice boundaries, never copy the
code in.

One of its tests pins the **real artifact names** every repo's CI produces. The
asset picker matches by suffix, so a renamed installer degrades to "no installer
for your platform" with no error. If a bundle identifier or artifact name
changes, that test is where you find out.

## 4. A nightly published as a draft is invisible

Already in `UPDATES.md`, repeated because it is the single easiest thing to
break while editing a workflow: GitHub's API does not return draft releases to
an unauthenticated caller, and the four apps call it unauthenticated. Nightlies
must publish as **pre-releases**. Stable tags may be drafts — nothing is looking
for them until they are promoted.

## What the desktop does that the phone does not (yet)

Worth knowing if the two are ever compared: the desktop's `primeUpdateCheck()`
runs once per app launch and dots the entry point, so you never open the panel
to find nothing. The Android panel only checks when opened. That difference, and
a shipped Android build whose panel has no call site at all, are written up in
the Android review linked at the top.
