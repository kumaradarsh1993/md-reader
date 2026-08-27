# CLAUDE.md — Fox MD

Project notes for agents working on this repo. Fox MD is a Tauri 2 +
SvelteKit markdown reader shipping Windows, macOS and Linux builds from
GitHub Actions.

## macOS build requirements — read before touching bundling

**Most work on this repo happens on Windows. macOS has a hard requirement that
Windows does not, and it has already shipped broken builds (fixed 2026-08-28).**

macOS refuses to run an app whose bundle is not code-signed. Tauri only signs
the `.app` when `bundle.macOS.signingIdentity` is set. Without it, `codesign`
still stamps the inner executable (the linker does that automatically on Apple
Silicon) but nothing seals the bundle, so `Contents/_CodeSignature/` is absent
while the embedded signature still claims sealed resources exist. macOS reads
that as a tampered app and reports **"Fox MD is damaged and can't be opened"** —
a hard block. There is no "Open Anyway" for this state, and right-click → Open
does not help.

There is no Windows equivalent, which is exactly why it keeps getting missed:
the build succeeds, CI is green, the `.dmg` mounts fine, and the artifact is
not corrupt. Only an actual Mac shows the failure.

### Rules

1. **Never remove `bundle.macOS.signingIdentity` from `tauri.conf.json`.** It is
   set to `"-"` (ad-hoc). That is free, needs no Apple account and no secrets.
2. **Keep `hardenedRuntime: false`** unless you are wiring up notarization. It
   defaults to **true** in Tauri 2, and hardened runtime denies access to protected resources
   regardless of what the user grants in System Settings.
3. **Do not tell users to right-click → Open.** That stopped bypassing
   Gatekeeper in macOS 15 (Sequoia). The correct instruction is
   **System Settings → Privacy & Security → Open Anyway**, or
   `xattr -dr com.apple.quarantine "/Applications/Fox MD.app"`.
4. **Do not delete the "Verify macOS bundle signature" step** in
   `.github/workflows/release.yml`. It is the only thing that catches this
   before users do.

### What ad-hoc signing does and does not buy

| | |
|---|---|
| Fixes "damaged" hard block | ✅ yes |
| Removes the first-launch warning | ❌ no — needs Apple notarization ($99/yr) |
| Stable identity across builds | ❌ no — hash changes every build |

Users still get **one** "Apple could not verify..." prompt and click Open Anyway.
Only enrolling in the Apple Developer Program removes it entirely.

### Verifying on a Mac

```bash
codesign --verify --deep --strict --verbose=2 /Applications/Fox MD.app
```

`valid on disk` + `satisfies its Designated Requirement` is correct.
`code has no resources but signature indicates they must be present` or
`code object is not signed at all` means the signing config was lost again.


