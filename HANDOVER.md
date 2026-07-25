# Handover — md-reader

> Self-contained context for whoever (human or AI) picks up this project next.
> Last updated 2026-07-25: **v0.6.0** cut. Everything up to and including
> v0.6.0 is intended to sit on the **stable** channel.

## Where things stand

**Release channel policy (2026-07-25):** the nightly experiment is over. The
user asked for everything to be promoted to stable, so v0.5.1 and v0.6.0 are
both meant to carry no pre-release flag, with v0.6.0 as `latest`. Future
releases go out as stable unless the user says otherwise.

| Version | Status | Headline |
|---|---|---|
| v0.2.0 | Published (stable) | Smart edit mode + user-first README + CI workflow |
| v0.3.0 | Published (stable) | Toolbar cleanup, About dialog, tab tear-out z-order fix |
| v0.4.0 | Published | Live Edit Theatre + Diff Tracker sidebar |
| v0.5.0 | Published | Theatre v2: recede-not-shrink, fresh/stale highlights, leader lines, Groq |
| v0.5.1 | Published — **promote to stable** | Sepia reading theme + toolbar 3-way theme switch |
| **v0.6.0** | **This release** | Reading-position memory, outline scroll-spy, collapsible side panel, visual width control, Theatre audit |

- **Repo**: <https://github.com/kumaradarsh1993/md-reader>
- **Branch**: `master`. v0.6.0 work was committed straight to master at the
  user's explicit request.
- **Vite dev port**: `1430` (a sibling Tauri project keeps 1420)
- **Local git identity (repo-local, not global)**: `Kumar Adarsh <kumaradarsh1993@users.noreply.github.com>`

### Release steps that still need a human

The v0.6.0 **commit is on master**, but the release itself cannot be cut from a
Claude Code web session: the git proxy rejects tag pushes with a 403, the GitHub
MCP tools are read-only for releases, and direct `api.github.com` access is
blocked. So the tag has to be pushed from a normal shell, which is what triggers
the CI build:

```bash
git fetch origin master && git checkout master && git pull
git tag -a v0.6.0 -m "md-reader v0.6.0"
git push origin v0.6.0        # → CI builds Win/macOS/Linux, creates a DRAFT release

# once CI is green:
gh release edit v0.6.0 --draft=false --latest

# and promote the last nightly to stable:
gh release edit v0.5.1 --prerelease=false
```

Note the landing site (`docs/site-data.js`, `docs/index.html`) already points at
`v0.6.0` download URLs, so those links 404 until the release is published.

## What v0.6.0 added

The user's report, paraphrased: *"if one file is scrolled to the bottom and I
switch to another tab, that one has scrolled too — bad experience"*, plus a
list of side-panel and toolbar complaints, plus "audit the Live Edit Theatre".

### Reading position memory

- **Per-tab scroll positions.** The Viewer is a single long-lived instance
  shared by every tab, and it used to restore whatever `scrollTop` it last saw
  — which is exactly why tab A's offset appeared in tab B. It now keys off a
  `tabId` prop, flushes the outgoing tab's position before reading the
  incoming one, and explicitly starts unvisited documents at the top.
- **Cross-session resume.** Positions persist per file path in
  `settings.scrollMemory` (capped at 200, oldest evicted). Each mark stores
  *both* the source line of the top-most visible block and the scroll ratio:
  the line anchor survives font-size / zoom / content-width changes and edits
  below the reading position; the ratio is the fallback for when that block is
  gone.
- **The ribbon** (`src/lib/ResumeRibbon.svelte`) — a hairline accent rule with
  a "you left off here" tag, bright for ~5s then settling to `opacity: .38`.
  Once it scrolls out of view a marker appears in the right gutter to travel
  back. Both are pure presentation; the Viewer computes all geometry.
- Settings → Reading position controls cross-session persistence, the ribbon,
  and offers "Forget saved positions". **Per-tab retention is unconditional** —
  that's correct behaviour, not a feature to toggle.
- Writes are coalesced on a 600ms trailing timer and force-flushed on
  `beforeunload` / `pagehide` / visibility-hidden, so quitting right after
  scrolling doesn't lose the position.

### Outline scroll-spy + rework

- `src/lib/outline.ts` is the shared heading parser: ATX **and setext**
  headings, fence-aware, inline markdown stripped from labels, slugs deduped
  the same way `post-render.ts` assigns ids. Setext support matters because the
  renderer emits those as real `<h1>`/`<h2>` — missing them desynchronised the
  outline from the document.
- `src/lib/view-nav.svelte.ts` is the Viewer ↔ Outline bridge. **Source line
  numbers are the shared coordinate**, deliberately: comrak's `data-sourcepos`
  gives exact line ranges, whereas slug matching breaks on duplicate heading
  text. The Viewer publishes `activeLine` / `topLine` / `progress`; the outline
  calls `jumpToLine()`, which falls back to a slug lookup when no Viewer is
  mounted (edit mode).
- The duplicated "Outline" title — the panel section header *and* the outline
  component both drew one — is fixed.

### Side panel

- Whole-pane collapse (`settings.panelCollapsed`) with a single toolbar button,
  independent of which sections are enabled, so expanding restores what you
  had. `Ctrl+B` was rebound from "toggle Files" to this.
- Hover-peek on the window's left edge while collapsed
  (`settings.panelHoverPeek`), with a pin to dock it.
- Draggable Files/Outline split (`settings.panelSplit`) and an improved width
  resizer.

### Content width control

`src/lib/WidthControl.svelte` replaces the `86ch` badge with a miniature page
whose lines of text are as wide as the real content column. Driven by ‹ ›
buttons (8ch), horizontal drag, or the wheel; the number appears on hover only.
`role="slider"` with arrow/Home/End keys.

## Files worth knowing about

| File | Why it matters |
|---|---|
| `README.md` | User-first landing page. Screenshot placeholders still TODO (see `DEMO.md`). |
| `CHANGELOG.md` | Newest first. v0.6.0 → v0.5.1 → v0.5.0 → … |
| `HANDOVER.md` | **This file.** Keep it current. |
| `DEMO.md` | Recording playbook for README screenshots / hero GIF. Still not recorded. |
| `docs/` | The GitHub Pages landing site. `site-data.js` holds the copy and download links — **remember to bump the version there on every release**. |
| `docs/proposals/live-edit-theatre.md` | Design doc + locked decisions for Theatre. Read before touching that module. |
| `src/lib/Viewer.svelte` | Rendered HTML + scroll memory + scroll-spy + diff/theatre highlight painters. `.viewer` is `position: relative` — the ribbon and the live-follow maths depend on it being the offsetParent. |
| `src/lib/outline.ts` | Heading parser. Shared, and slug-compatible with `post-render.ts` — change both together. |
| `src/lib/view-nav.svelte.ts` | Viewer ↔ Outline bridge, source-line based. |
| `src/lib/ResumeRibbon.svelte` | "You left off here" ribbon + gutter marker. |
| `src/lib/WidthControl.svelte` | Visual content-width control. |
| `src/lib/LeftPanel.svelte` | Collapsible/peekable panel, both dividers. |
| `src/lib/settings-store.svelte.ts` | Settings schema + scroll-memory persistence. Legacy `liveTrack`/`diffMode` keys are still read by `Viewer.svelte`; no UI writes them. |
| `src/lib/tabs-store.svelte.ts` | Per-tab state: source, baseline, scroll/resume marks, theatre fields. |
| `src/lib/theatre/` | The Live Edit Theatre module. See breakdown below. |
| `.github/workflows/release.yml` | Tag push → 3-platform build → **draft** release (`prerelease: false`). Published manually. |

### src/lib/theatre/ module breakdown

```
src/lib/theatre/
  types.ts            — Turn, TheatrePhase, SelectedView, FreshRange
  diff-engine.ts      — diff-match-patch wrapper, heading-bounded section
                        splitter, changed-range computation
  store.svelte.ts     — per-tab state machine, ring buffer, fresh-range decay
  StatusBar.svelte    — bottom-left status during/after a turn
  ResumeChip.svelte   — floating chip to show/hide/clear highlights
  TipBanner.svelte    — one-shot discoverability tip for non-users
  DiffSidebar.svelte  — right panel: turn picker + per-section cards
  SidebarConnectors.svelte — SVG leader lines from paragraphs to cards
```

## Outstanding tasks (in priority order)

### High priority

1. **Publish the v0.6.0 draft release and clear v0.5.1's pre-release flag.**
   Commands above. Needs a shell with `gh`.
2. **Smoke-test v0.6.0 on a real install.** Specifically: open two long files
   in tabs, scroll each to a different place, switch back and forth; close and
   reopen the app and confirm you land where you were with the ribbon showing;
   collapse the panel and hover the left edge; drag the Files/Outline divider;
   drag the width glyph.
3. **Local Windows builds need `CARGO_BUILD_JOBS=2`** — low-memory machine
   quirk, see "Known quirks".
4. **Enable GitHub Discussions** (Settings → General → Features). The
   issue-template `config.yml` already routes questions there.
5. **Record demo assets.** Storyboards in `DEMO.md`. Hero GIF + 5 README
   screenshots are the minimum. The new resume-ribbon and width control are
   both very demoable.
6. **Post the launch.** `LINKEDIN_POST.md` drafts are still v0.2.0-era.

### Medium priority

7. **Multi-provider LLM support** beyond Groq/Anthropic (Gemini free tier).
8. **Mac-native polish** — verify the Theatre recede animation on WKWebView,
   Cmd shortcuts, titlebar style, and the hover-peek gesture with a trackpad.
9. **Nested folder tree** in the file browser (currently single-level).
10. **Outline drag-to-reorder sections** would be a natural next step now that
    the outline knows exact source lines for every heading.

### Low priority

11. Auto-update mechanism (Tauri 2 supports it; needs a signing key).
12. Code-signed builds for Windows + Mac.

## Known quirks / gotchas

- **Local `tauri build` requires `CARGO_BUILD_JOBS=2` on the user's Windows
  machine.** Parallel rustc workers exceed available RAM and get silently
  killed; cargo then reports a useless "failed to build app". CI is unaffected.
- **Stale `C:\` paths in `target/`.** The project moved from C: to D:. If a
  local build fails with `\\?\C:\...` errors: `cd src-tauri && cargo clean`.
- **Sibling Tauri project port collision.** `wispr-fox` uses 1420; md-reader
  is on 1430. Don't change back without checking.
- **HMR full-page-reload from state-store edits.** Editing
  `settings-store.svelte.ts` or `tabs-store.svelte.ts` triggers a full
  SvelteKit reload, which occasionally kills the WebView2 instance during dev.
  Just restart the dev session.
- **Theatre turn history is in-memory only, by design.** The file on disk is
  the source of truth; don't add sidecar files. Note this is *unlike* scroll
  positions, which are deliberately persisted — a reading position is the
  user's own state, not a derived artefact of the document.
- **Theatre triggers on ANY external edit**, not just AI. We don't fingerprint
  the writer. Documented behaviour.
- **Scroll marks are keyed by absolute file path.** Move or rename a file and
  its remembered position is orphaned (harmless — it just ages out of the
  200-entry cap).
- **`Ctrl+B` changed meaning in v0.6.0** (Files toggle → panel collapse). If a
  user reports "Ctrl+B stopped opening the file list", that's why; the 📁
  button does that job and also un-collapses the panel.

## Tech stack at a glance

- **Backend**: Tauri 2 + Rust. Markdown via `comrak` with syntect highlighting
  and `sourcepos` enabled (the frontend leans on it heavily — scroll anchors,
  scroll-spy, highlight painting, leader lines). File watching via
  `notify-debouncer-full` with an mtime poll fallback for cloud-drive paths.
  Windows-only `windows-sys` for `AllowSetForegroundWindow` (tab tear-out
  z-order).
- **Frontend**: SvelteKit (Svelte 5 runes) + Vite 6. Smart edit via
  `@milkdown/crepe`, raw edit via CodeMirror 6, math via KaTeX, diagrams via
  Mermaid, diff via `diff-match-patch`. Settings via `tauri-plugin-store`.
- **Build**: `npm run tauri dev` / `npm run tauri build`. `npm run check` for
  svelte-check — **it should report 0 errors, 0 warnings; keep it that way.**

## Useful commands

```bash
npm run tauri dev          # dev with HMR
npm run check              # svelte-check (must stay 0/0)
npm run build              # frontend-only production build

# Local production build (Windows — needs the job cap)
$env:CARGO_BUILD_JOBS = "2"
npm run tauri build

# Cut a release
git tag v0.X.Y && git push --tags     # CI → draft release with installers
gh release edit v0.X.Y --draft=false --latest
```

---

If you're a Claude session picking this up cold: read this file, then
`README.md`, then the top of `CHANGELOG.md`. Then ask the user what they want
next — the obvious candidates are (a) publish the pending release, (b) record
demo assets, (c) post the launch, (d) the medium-priority items above.
