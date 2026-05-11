# Handover — md-reader

> Self-contained context for whoever (human or AI) picks up this project next.
> Written 2026-05-11 right after shipping v0.2.0.

## Where things stand

**v0.2.0 is shipped.** Built by GitHub Actions, published as a public release with installers for Windows / macOS / Linux. The README's per-OS download badges now resolve to real downloads.

- **Release**: <https://github.com/kumaradarsh1993/md-reader/releases/tag/v0.2.0>
- **Repo**: <https://github.com/kumaradarsh1993/md-reader>
- **Branch**: `master` (HEAD at the v0.2.0 commit + the CI workflow commit on top)
- **Local checkout**: `D:\Claude Code Projects\md-reader`
- **Local git identity (repo-local, not global)**: `Kumar Adarsh <kumaradarsh1993@users.noreply.github.com>`
- **Vite dev port**: `1430` (not the Tauri default `1420` — that's used by the sibling `wispr-fox` project on this machine; `tauri.conf.json` `devUrl` matches)

## What v0.2.0 added

The headline:

- **Smart edit mode** — WYSIWYG editor that hides every `##`, `**`, `[text](url)`. Powered by **Milkdown / Crepe** (ProseMirror-based, round-trips through remark AST so saves stay clean). New default for `Ctrl+E`. Source file: `src/lib/SmartEditor.svelte`.
- **Smart / Raw sub-toggle** appears in the toolbar when editing — flips between WYSIWYG and the raw CodeMirror 6 source view (`src/lib/Editor.svelte`).
- **Default-quieter toolbar** — live-track (📡) and diff-mode (🔍), plus the smart-diff ✨ Why? action, all moved to Settings → Experimental, off by default. Existing users with the legacy flags on are migrated automatically. Migration code is in `src/lib/settings-store.svelte.ts`.
- **"Split" mode retired** — the toolbar is `View / Edit` now. Less to think about.
- **Visual continuity** — smart edit surface mirrors the viewer's typography, content width, and side panel. Only a faint paper-tint background (`--bg-edit`) signals "you're editing." This was the main UX iteration in this cycle; Crepe's heavy "frame" theme was dropped and the Crepe CSS variables are now mapped to the app's existing theme tokens so chrome (toolbar, slash menu, block handle) follow dark / light mode.

Everything else (live-reload, multi-tab, drag-tear-out, side panel, KaTeX/Mermaid/syntect, settings persistence) is unchanged.

## Files worth knowing about

| File | Why it matters |
|---|---|
| `README.md` | Rewritten user-first in this cycle. Big download badges at top, plain-English Quick Start + flows, build-from-source collapsed inside `<details>`. The `<!-- TODO: screenshot -->` placeholders are waiting for the recorded assets. |
| `CHANGELOG.md` | Full 0.2.0 entry. |
| `DEMO.md` | Recording playbook — recommended software (ScreenToGif for short GIFs, OBS Studio for the LinkedIn video), storyboards for the hero GIF + the LinkedIn video + the five README screenshots. **The user has not recorded these yet.** |
| `LINKEDIN_POST.md` | Two drafts for the v0.2.0 launch post (Draft 1 = personal-story tone matching the v0.1 voice, recommended). Carousel slide briefs are at the bottom of the file. **Not yet posted.** |
| `test-fixtures/round-trip.md` | Grab-bag fixture for verifying smart-edit round-trip fidelity. Open it, switch to Smart edit, no edits, save → should diff cleanly. |
| `.github/workflows/release.yml` | The CI that built v0.2.0. Triggers on tag push (`v*`). Builds Win / macOS-universal / Linux, creates a *draft* release with all artifacts attached. We published v0.2.0's draft manually after a smoke-test. |
| `.github/ISSUE_TEMPLATE/{bug,feature,config}.yml` | Friendly issue templates. Blank issues are disabled; `config.yml` routes "questions / vibes" to GitHub Discussions (which still needs to be enabled in the repo settings — see "Outstanding tasks"). |
| `src/lib/SmartEditor.svelte` | The new WYSIWYG editor wrapping Crepe. Lazy-loaded. Drops Crepe's `frame.css` theme and maps Crepe vars to app theme. Mirrors Viewer's prose styles for visual continuity. |
| `src/lib/settings-store.svelte.ts` | Settings schema with the new `editorMode`, `experimentalLiveTrack`, `experimentalDiffMode` fields and the legacy-flag migration logic. |

## Outstanding tasks (in priority order)

### High priority (user actions, no AI work needed)

1. **Smoke-test the published installer.** Download `md-reader_0.2.0_x64_en-US.msi` from the release page, install on this Windows machine, verify Ctrl+E → smart edit works end-to-end on a real `.md` file.
2. **Enable GitHub Discussions** on the repo (Settings → General → Features → check "Discussions"). The `config.yml` issue template already routes "vibes" questions there.
3. **Record the hero GIF + the five README screenshots.** Storyboards are in `DEMO.md`. Then uncomment the `<!-- TODO: screenshot -->` blocks in `README.md` (search for `TODO: screenshot`) to bring the images live. Each TODO comment has the ready-to-uncomment `![](docs/img/...)` line waiting.
4. **Post the LinkedIn launch post.** Draft 1 in `LINKEDIN_POST.md` is the recommended take. Posting tips are in the same file (first comment gets the link, not body; Tuesday/Wednesday 8–10am their time zone; 3 hashtags max).
5. **Post on Reddit.** `r/markdown`, `r/coolgithubprojects`, `r/ClaudeAI` are the candidates. The Reddit voice in `REDDIT_POST.md` (existing file) is the right tone — adapt the LinkedIn Draft 1 to be more "I built this thing, what would you want" and less corporate.

### Medium priority (work for next AI session if asked)

6. **Mac-native polish (when user has Mac access)** — currently the app uses `Ctrl + key` shortcuts that work via `e.metaKey || e.ctrlKey`, so Cmd+E works on Mac out of the box. But the Apple titlebar style (`"titleBarStyle": "Overlay"` in `tauri.conf.json`) and native File/Edit/View system menu are not yet wired. Out of scope for v0.2.0; flag as v0.3.
7. **Add a "send feedback" link in-app.** Settings panel could grow a "Suggest a feature / report a bug" footer linking to the GitHub Issues page. Low cost, helpful for non-technical users who otherwise wouldn't know how.
8. **Frozen-block UX for code blocks in smart edit.** Currently Crepe handles them as CodeMirror inline blocks — works but could be cleaner. Original plan (in `C:\Users\kadar\.claude\plans\there-is-a-project-linear-mccarthy.md`) called for an explicit "Edit source" popover.

### Low priority / nice-to-haves

9. Auto-update mechanism (Tauri 2 supports it; needs signing key generation).
10. Code-signed Mac and Windows builds (Apple Developer = $99/yr; Windows EV cert = ~$500/yr or skip and accept SmartScreen warning).
11. Track install counts via GitHub Release download stats. No telemetry in-app — that's a design principle.

## Known quirks / gotchas

- **Stale `C:\` paths in `target/`** — the project was moved from `C:` to `D:` at some point. Cargo cached the old absolute paths. If a local Tauri build dies with a `\\?\C:\...` "system cannot find the path specified" error, run `cd src-tauri && cargo clean` and rebuild. This already bit us once during the v0.2.0 cycle.
- **Local `tauri build` flakiness on Windows** — during v0.2.0 release, the local Windows release build silently died twice during dep compilation with a generic "failed to build app" error and no Rust panic. Likely Windows long-path / antivirus interference on deep `target/release/build/...` paths. **The GitHub Actions build works fine** — the CI environment has cleaner filesystems and shorter paths. If a local build hangs, just rely on CI.
- **Sibling Tauri project port collision** — `wispr-fox` (also on this machine) uses port `1420`. md-reader was moved to `1430` to coexist. Don't change either back to `1420` without checking.
- **`Ctrl+L` and `Ctrl+D` are no-ops by default** — they only fire when the respective experimental flags are enabled. This is intentional. If the user reports "Ctrl+L stopped working," ask them to flip the toggle in Settings → Experimental.
- **HMR full-page-reload from settings-store edits** — any edit to `src/lib/settings-store.svelte.ts` triggers a full SvelteKit reload (state files can't HMR cleanly). During dev iteration this can occasionally crash the WebView2 instance and close the Tauri window — exit code 1, no panic in logs. Just restart the dev session.

## Tech stack at a glance

- **Backend**: Tauri 2 + Rust. Markdown rendering: `comrak` 0.43 with syntect highlighting. File watching: `notify-debouncer-full` 0.5 with mtime poll fallback for OneDrive paths (notify is flaky on reparse points).
- **Frontend**: SvelteKit (Svelte 5 runes) + Vite 6. Smart edit via `@milkdown/crepe` 7.20 (lazy-loaded). Raw edit via CodeMirror 6 (lazy-loaded). Math via KaTeX, diagrams via Mermaid (both lazy-loaded). Settings persisted via `tauri-plugin-store`.
- **Build**: `npm run tauri dev` for dev with HMR + native window. `npm run tauri build` for installer (works in CI; local is flaky as noted). `npm run check` for svelte-check (currently 0 errors / 0 warnings).
- **CI**: `.github/workflows/release.yml`. Runs on tag push. Produces .msi/.exe (Win), universal .dmg (Mac), .deb/.rpm/.AppImage (Linux). Auto-creates draft release; user publishes manually after smoke-test.

## Useful commands

```bash
# Dev mode (native Tauri window with HMR)
npm run tauri dev

# Type check
npm run check

# Local production build (flaky on this machine — prefer CI)
npm run tauri build

# Cut a new release
git tag v0.2.1 && git push --tags
# → triggers CI, creates draft release with installers attached
# → user reviews + clicks "Publish release" on the GitHub page

# Check CI status
gh run list --workflow="Build & release installers" --limit 5
gh run view --log  # for the latest run
```

## Open questions / decisions the next session might need to make

- **Should the smart-diff API key (Anthropic) be in Experimental too?** Currently it's a prominent "Smart-diff" section in Settings. Empty key = feature disabled. Not really experimental in behaviour. Leaving as-is unless the user revisits.
- **Custom protocol handler for `obsidian://`-style deep links?** Could open `md-reader://open?path=...` from a browser link to the desktop app. Niche but slick for the AI-tools integration angle. No one's asked yet.
- **Should `editorMode` (Smart vs Raw default) be exposed via a CLI flag?** For users who want raw mode as default forever. Currently only via Settings dialog. Low cost to add.

---

If you're a Claude session picking this up cold: start by reading this file, then `README.md`, then skim `CHANGELOG.md`. Then ask the user what they want to do next — the obvious choices are (a) record the demo assets, (b) post the launch, (c) start on v0.3 features, or (d) something else they have in mind.
