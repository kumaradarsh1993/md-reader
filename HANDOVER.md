# Handover — md-reader

> Self-contained context for whoever (human or AI) picks up this project next.
> Last updated 2026-05-14: v0.4.0 published as **Pre-release / Nightly**; v0.3.0 keeps the "Latest" badge.

## Where things stand

**Release channel policy (2026-05-14):** v0.4.0 ships on the **Nightly / Pre-release** channel. v0.3.0 remains the stable "Latest" release. All upcoming feature work continues on the nightly channel (tag releases with `--prerelease`) until the user explicitly says "promote to stable". Promotion command when approved: `gh release edit vX.Y.Z --prerelease=false --latest`.

| Version | Status | Headline |
|---|---|---|
| **v0.2.0** | Published (stable) | Smart edit mode + user-first README + CI workflow |
| **v0.3.0** | **Published — Latest stable** | Toolbar cleanup, About dialog, tab tear-out z-order fix |
| **v0.4.0** | **Published — Pre-release / Nightly** | Live Edit Theatre + Diff Tracker sidebar (the product wedge) |

- **Repo**: <https://github.com/kumaradarsh1993/md-reader>
- **Latest release page**: <https://github.com/kumaradarsh1993/md-reader/releases>
- **Branch**: `master`. HEAD is the v0.4.0 commit, the v0.4.0 tag points at it.
- **Local checkout**: `D:\Claude Code Projects\md-reader`
- **Local git identity (repo-local, not global)**: `Kumar Adarsh <kumaradarsh1993@users.noreply.github.com>`
- **Vite dev port**: `1430` (wispr-fox keeps 1420)
- **Both v0.3.0 and v0.4.0 ship installers for Win / macOS (universal) / Linux** via the `.github/workflows/release.yml` CI on every tag push.

## What v0.3.0 added (Phase A — basics cleanup)

- **Tab tear-out z-order fix.** Drag a tab out → the new window reliably comes to the front. Fixed on Windows by transferring foreground rights to the child PID via `AllowSetForegroundWindow` (new `windows-sys` Windows-only dep) plus an explicit `set_focus()` on the child side. Belt-and-braces.
- **About dialog.** File menu → "About md-reader…". Shows version (via `getVersion()` from Tauri's app API), repo, license, quick links to releases / bug / feature pages. Opens external links in the system browser via plugin-opener.
- **Toolbar cleanup.** `📡 Track`, `🔍 Diff`, `✨ Why?` buttons and the `Ctrl+L` / `Ctrl+D` shortcuts removed entirely. The smart-diff inline banner is gone too. Width and zoom controls now sit in two distinct segmented groups with vertical dividers from the find/settings cluster. Settings cog is larger and more clickable.
- **Settings cleanup.** Legacy `experimentalLiveTrack` and `experimentalDiffMode` keys removed. New `advancedLiveEditTheatre` single toggle in the new **Advanced features** section (off by default).

## What v0.4.0 added (Phase B — Live Edit Theatre)

This is the headline feature. **Off by default** — enable via Settings → Advanced features → 🎬 Live Edit Theatre.

When enabled, and an external edit hits the file:

- **Smooth zoom-out** of the content (CSS `transform: scale(0.78)`) + faint global background desaturation (`filter: saturate(.88)`). Reads as "an AI is working on this — watch the show."
- **Bottom-left status bar** during the turn: live change count + pulsing dot. Morphs after 5s idle to `✅ Edits done — X changes highlighted · Dismiss · Show details`.
- **Yellow highlights** painted on every changed region via comrak's `data-sourcepos`. Stay visible after dismiss.
- **Floating "Show / Hide changes" chip** top-right of the viewport after dismiss. Click ✕ to clear the highlights entirely (which also resets the in-memory turn buffer).
- **Diff sidebar** (`Ctrl+Shift+D` or "Show details" button). Word-comments-style right pane. Each changed section is a card. Per-card mode toggle:
  - **Naive diff** — red strikethrough / green underline inline via `diff-match-patch`. Local, no network.
  - **✨ Summary** — prose summary by Claude, fetched on demand. Reuses the existing Anthropic API key from Settings → Smart-diff.
- **10-turn ring buffer per tab.** Sidebar dropdown lets you re-view any past turn as a frozen artefact (`v3 — 2 min ago`), plus a cumulative "Since file opened" option. In-memory only, lost on app close.
- **Discoverability tip.** Users without Theatre enabled see a one-shot bottom-of-screen banner the first time an external edit arrives — "Did you know? Enable Live Edit Theatre to watch AI edits in cinema view → Enable / ✕".

## Files worth knowing about (updated)

| File | Why it matters |
|---|---|
| `README.md` | User-first landing page from v0.2.0 cycle. Per-OS download badges at top, plain-English Quick Start + flows, build-from-source collapsed inside `<details>`. Screenshot placeholders still TODO (see `DEMO.md`). |
| `CHANGELOG.md` | Latest entries are v0.4.0 → v0.3.0 → v0.2.0. Read in that order for context. |
| `HANDOVER.md` | **This file.** Keep it current. |
| `DEMO.md` | Recording playbook for the README screenshots / hero GIF / LinkedIn video. Still not recorded as of 2026-05-13. |
| `LINKEDIN_POST.md` | Two drafts for the v0.2.0 launch + a v0.4.0 update angle would be valuable to add. Not posted yet. |
| `docs/proposals/live-edit-theatre.md` | The full design doc and locked decisions for the Theatre feature. Read this BEFORE making changes to the theatre module. |
| `test-fixtures/round-trip.md` | Grab-bag for verifying smart-edit round-trip fidelity. Still v0.2.0 era. |
| `.github/workflows/release.yml` | Builds Win / macOS-universal / Linux on every tag push (`v*`). Creates a *draft* release with all artifacts attached. We publish manually after smoke-test. |
| `.github/ISSUE_TEMPLATE/{bug,feature,config}.yml` | Friendly issue templates. Discussions still need to be enabled in repo settings. |
| `src/lib/theatre/` | **New in v0.4.0.** The entire Live Edit Theatre module. See breakdown below. |
| `src/lib/SmartEditor.svelte` | Milkdown / Crepe WYSIWYG editor (from v0.2.0). |
| `src/lib/Editor.svelte` | CodeMirror 6 raw markdown editor (from v0.1.x). |
| `src/lib/Viewer.svelte` | comrak-rendered HTML view + smart-scroll + diff/theatre highlight painters. |
| `src/lib/settings-store.svelte.ts` | Settings schema. Latest fields: `editorMode`, `advancedLiveEditTheatre`. Legacy `liveTrack`/`diffMode` keys still in schema (read-only, ignored). |
| `src/lib/tabs-store.svelte.ts` | Per-tab state including `turns[]`, `theatrePhase`, `pendingTurnBefore`, `selectedView`, `sidebarOpen`, `highlightsHidden`, `tipDismissed`. |
| `src/lib/smart-diff.ts` | Anthropic API wrapper. Reused by the v0.4.0 sidebar for per-section LLM summaries. |
| `src-tauri/src/commands.rs` | `spawn_window` has the new `AllowSetForegroundWindow` call. |
| `src-tauri/src/lib.rs` | Torn-out child windows call `set_focus()` in setup. |
| `src-tauri/Cargo.toml` | New `windows-sys` Windows-only dep for `AllowSetForegroundWindow`. |

### src/lib/theatre/ module breakdown

```
src/lib/theatre/
  types.ts            — Turn, TheatrePhase, SelectedView types
  diff-engine.ts      — diff-match-patch wrapper, section splitter,
                        changedRanges computation (used by Viewer for
                        highlight painting + sidebar for naive diff)
  store.svelte.ts     — onBeforeExternalEdit / onAfterExternalEdit hooks
                        (called from tabs-store), state machine, ring
                        buffer management, dismiss / toggle helpers,
                        viewSnapshots()
  StatusBar.svelte    — bottom-left status bar during turn + post-turn
                        "Edits done" state with Dismiss + Show details
  ResumeChip.svelte   — top-right floating chip after dismiss with
                        Show/Hide changes toggle + clear ✕
  TipBanner.svelte    — bottom-center one-shot discoverability tip for
                        users who haven't enabled theatre yet
  DiffSidebar.svelte  — right-side panel: turn dropdown + per-section
                        cards with Naive ↔ Summary mode toggle
```

## Outstanding tasks (in priority order)

### High priority

1. **Promote v0.4.0 from Nightly → stable Latest** once the user is satisfied with it. Command: `gh release edit v0.4.0 --prerelease=false --latest`. Remind the user once per session that v0.4.0 is awaiting promotion — don't nag.
2. **Smoke-test v0.4.0 on this machine.** Install one of the .msi files, open a markdown file, enable Live Edit Theatre in Settings → Advanced features, then have Claude (or any editor) write to the file from elsewhere. Verify the zoom-out animation, status bar, highlights, and sidebar (`Ctrl+Shift+D`) all work as designed.
3. **Local Windows builds need `CARGO_BUILD_JOBS=2`** — there's a low-memory machine quirk (parallel rustc workers exceed available RAM and get silent-killed). See "Known quirks" below.
4. **Enable GitHub Discussions** on the repo (Settings → General → Features → check Discussions). The issue-template `config.yml` already routes "vibes" questions there.
5. **Record demo assets.** Storyboards in `DEMO.md`. The hero GIF + 5 README screenshots are the minimum.
6. **Post the launches.** v0.2.0 / v0.3.0 / v0.4.0 happened fast — could fold the smart-edit + theatre story into one LinkedIn launch post. Two drafts in `LINKEDIN_POST.md` are still v0.2.0-only.

### Medium priority (next AI session work)

7. **Per-turn LLM summary caching across sidebar open/close.** Currently the `llmCache` lives in component-local state. Move to `Turn.llmSummary` (the type already supports it) so it survives sidebar reopens.
8. **Multi-provider LLM support.** v0.4.0 reuses the Anthropic API key. The proposal flagged Grok / Gemini free tiers as a path for the niche. Cleanest add: a provider picker in Settings → Smart-diff.
9. **Mac-native polish.** When the user has Mac access — verify the Theatre transform animation looks right on WKWebView, check Cmd shortcuts (`Cmd+Shift+D` etc.), titlebar style. Tauri's metaKey handling already covers it; this is visual QA.
10. **Per-section heading anchor click → scroll to section.** The sidebar cards currently don't scroll the Viewer when clicked. Easy add — `findElementByLine(container, section.startLineAfter)?.scrollIntoView()`.

### Low priority

11. Auto-update mechanism (Tauri 2 supports it; needs signing key).
12. Code-signed builds for Windows + Mac (out of scope until shipping to non-technical users in volume).

## Known quirks / gotchas

- **Local `tauri build` requires `CARGO_BUILD_JOBS=2` on this Windows machine.** Cause: parallel rustc workers exceed available RAM (only ~2.4 GB free during testing) → workers silently killed → cargo surfaces a useless "failed to build app: failed to build app". Recommended permanent fix: create `.cargo/config.toml` with `[build] jobs = 2`. CI is unaffected (GitHub runners have plenty of RAM).
- **Stale `C:\` paths in `target/`.** Project moved from C: to D: at some point. If a local build fails with `\\?\C:\...` path errors: `cd src-tauri && cargo clean` and rebuild.
- **Sibling Tauri project port collision.** `wispr-fox` (also on this machine) uses port `1420`. md-reader was moved to `1430` to coexist. Don't change back without checking.
- **HMR full-page-reload from state-store edits.** Any edit to `src/lib/settings-store.svelte.ts` or `tabs-store.svelte.ts` triggers a full SvelteKit reload. During dev iteration this can occasionally crash the WebView2 instance and close the Tauri window — exit code 1, no panic in logs. Just restart the dev session.
- **Theatre state is in-memory only, by design.** Once you close the app, all turn history is gone for every tab. The file on disk is the source of truth. Don't try to persist turns — it would violate the "no sidecar files" design principle.
- **Theatre triggers on ANY external edit, not just AI.** We don't fingerprint Claude vs Notepad vs OneDrive sync. The disk-watcher signal is the heuristic. Documented behaviour — if a user reports "theatre engaged when I saved from another editor", that's working as designed.

## App-data reset scenario (2026-05-13)

The user is about to clear app data (`%APPDATA%\md-reader\` on Windows — that's where Tauri's plugin-store keeps `settings.json`). After the clear:

- All settings reset to defaults from `DEFAULTS` in `settings-store.svelte.ts`.
- `advancedLiveEditTheatre: false` — Theatre will be invisible until re-enabled.
- `editorMode: "smart"` — Ctrl+E lands in smart edit (Milkdown).
- `theme: "auto"` — follows OS dark/light.
- Anthropic API key (`anthropicApiKey`) blank — Smart-diff LLM summary disabled until pasted back.
- Open tabs / recent files cleared.

This is intentional and good for testing — it lets the user verify the v0.4.0 feature from a clean state, exactly as a new user would experience it.

**To re-enable theatre after the wipe**: open Settings (`Ctrl + ,`) → Advanced features → tick `🎬 Live Edit Theatre`.

## Tech stack at a glance (updated)

- **Backend**: Tauri 2 + Rust. Markdown rendering via `comrak` 0.43 with syntect highlighting. File watching via `notify-debouncer-full` 0.5 with mtime poll fallback. Windows-only `windows-sys` for AllowSetForegroundWindow (z-order fix).
- **Frontend**: SvelteKit (Svelte 5 runes) + Vite 6. Smart edit via `@milkdown/crepe` 7.20. Raw edit via CodeMirror 6. Math via KaTeX, diagrams via Mermaid. Diff via `diff-match-patch` 1.0.5. Settings persisted via `tauri-plugin-store`.
- **Build**: `npm run tauri dev` for dev with HMR. `npm run tauri build` for installer (local: needs CARGO_BUILD_JOBS=2). `npm run check` for svelte-check (currently 0/0).
- **CI**: `.github/workflows/release.yml`. Tag push → 3-platform build → draft release with installers. Manual publish.

## Useful commands

```bash
# Dev (native Tauri window with HMR)
npm run tauri dev

# Type check
npm run check

# Local production build (Windows — needs job cap)
$env:CARGO_BUILD_JOBS = "2"
npm run tauri build

# Cut a new release
git tag v0.X.Y
git push --tags
# → CI builds + creates draft release with installers
# → User reviews + publishes manually:
gh release edit v0.X.Y --draft=false

# Check CI status
gh run list --workflow="Build & release installers" --limit 5
gh run view --log

# Publish a draft release
gh release edit v0.X.Y --draft=false
gh release view v0.X.Y
```

## Open questions / decisions for the next session

- **Promotion strategy after v0.4.0.** Theatre + Diff is the product wedge. Worth re-pitching with fresh screenshots/GIF that show the zoom-out + sidebar in action. The current `LINKEDIN_POST.md` drafts are smart-edit-only — they need an update.
- **Whether to consolidate three releases (v0.2 / v0.3 / v0.4) shipped in one week into one "Stable v2.0" message** like the user suggested earlier. Semver-wise the existing tags are right; for marketing purposes, leading with "md-reader 2.0" might land better. Decide before posting.
- **Whether to add a `.cargo/config.toml` to bake in `jobs = 2`.** Pros: never bites again on this machine, no env-var needed. Cons: it'll also apply to CI (where the cap is wasteful). Could gate via `[target.'cfg(windows)']` somehow, but cargo config doesn't really support that for build options. Verdict: skip; document the env var.

---

If you're a Claude session picking this up cold: start by reading this file, then `README.md`, then `CHANGELOG.md`. Then ask the user what they want to do next — the obvious choices are (a) finish publishing v0.4.0 if still draft, (b) record demo assets, (c) post the launch, (d) start on the next feature (per-section LLM caching, multi-provider, scroll-to-section), or (e) something they have in mind.
