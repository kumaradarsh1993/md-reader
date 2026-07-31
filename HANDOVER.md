# Handover — md-reader

> Self-contained context for whoever (human or AI) picks up this project next.
> Last updated 2026-07-31: **v0.7.0-nightly.1** cut — a visual/UX overhaul plus
> a batch of renderer fixes. **v0.6.0 remains the stable `latest`.**

## Where things stand

**Release channel policy (2026-07-31):** v0.6.0 was already published as
stable `latest` (verified — `isPrerelease: false`, all seven platform
artifacts attached), so there was nothing to promote. v0.7.0 therefore opens a
fresh **nightly** line so the visual changes can be smoke-tested on a real
install before they become the default. Promote with
`gh release edit v0.7.0-nightly.1 --prerelease=false --latest` once the owner
is happy, or re-cut as a clean `v0.7.0` tag.

| Version | Status | Headline |
|---|---|---|
| v0.2.0 | Published (stable) | Smart edit mode + user-first README + CI workflow |
| v0.3.0 | Published (stable) | Toolbar cleanup, About dialog, tab tear-out z-order fix |
| v0.4.0 | Published | Live Edit Theatre + Diff Tracker sidebar |
| v0.5.0 | Published | Theatre v2: recede-not-shrink, fresh/stale highlights, leader lines, Groq |
| v0.5.1 | Published | Sepia reading theme + toolbar 3-way theme switch |
| v0.6.0 | **Published — stable `latest`** | Reading-position memory, outline scroll-spy, collapsible side panel, visual width control, Theatre audit |
| **v0.7.0** | **This release — nightly** | Chrome/paper redesign, focus mode, right-click menus, breadcrumb, renderer + typography fixes, security baseline |

- **Repo**: <https://github.com/kumaradarsh1993/md-reader>
- **Branch**: `master`. v0.6.0 and v0.7.0 work was committed straight to master
  at the user's explicit request.
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

## What v0.7.0 added

Full detail in `CHANGELOG.md`; this is the orientation.

**The brief.** The owner's verdict on v0.6 was "95% there, but it still looks
developer-y — I want it to look general-consumer-y", with three specific
complaints: the side panel *"looks too similar to the text I'm reading"*, the
tab bar *"mixes too much with the text"*, and the toolbar showed a raw
`D:\...\file.md` path. Plus two feature asks (a fullscreen/focus button, and
right-click menus that mean something) and one platform ask (the black Windows
title bar should follow the app theme).

**The diagnosis, which is worth keeping.** The first two complaints were not
matters of taste and were not fixed by "more contrast":

- `--side-bg` and `--bg` were **the same colour in dark mode** (`#1c1c1e`). The
  panel *was* the document surface.
- The tab strip drew from `--muted-bg`, a token shared with in-document table
  headers. In dark mode that made it the brightest surface in the window.

The resolution is a **two-material model**: `--chrome-bg` for everything that
is not the document, and the document as a sheet floating on it (one rounded
corner, hairline ring, faint shadow). Light mode's tonal gap was *reduced*
(6.7% → 3.5%) and warmed — separation now comes from the edge, not the tone.
If you change one thing here, keep chrome tokens and document tokens
**separate**; merging them is what caused this.

**Architecture worth knowing:**

| File | Role |
|---|---|
| `src/lib/Icon.svelte` | The whole icon set, inlined Lucide-idiom geometry. Emoji are no longer used as UI anywhere. Stroke scales with size. |
| `src/lib/context-menu.svelte.ts` | Right-click menu store. `contextMenu.open(event, items)` — it calls `preventDefault()` for you. |
| `src/lib/ContextMenu.svelte` | The renderer. Mounted once, at the root of `+page.svelte`. Positions after measuring, hence the `.placed` class. |
| `src/lib/focus-mode.svelte.ts` | Focus mode state. Hides chrome **and** goes native-fullscreen; either alone is unsatisfying. |
| `src/lib/platform.ts` | `isMac`, `MOD`, `sk()` for shortcut labels, `copyText`, `revealInFileManager`. Every user-visible shortcut string goes through `sk()`. |
| `src/lib/Breadcrumb.svelte` | The document location. Elides from the left. |

**Two traps to not re-introduce:**

1. **`onMount` ordering in `+page.svelte` is load-bearing.** Local wiring
   (keyboard, context menu, drag-drop) is registered *before* the first
   `await`. It used to sit after a chain of Tauri calls, so one rejection
   silently removed every keyboard shortcut in the app. Do not move it back.
2. **`post-render.ts`'s table wrapper must copy `data-sourcepos`.** The Viewer
   indexes `.prose` children by that attribute; a wrapper without it drops
   every table out of scroll-restore, live-follow, diff mode and Theatre
   highlighting at once.

**Slug algorithm lives in two files** — `post-render.ts` (assigns ids) and
`outline.ts` (predicts them). They must stay byte-identical. Both now match
GitHub's, so `#anchor` links in hand-written tables of contents finally
resolve; the old `h-` prefix meant none of them ever did.

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

1. **Smoke-test v0.7.0-nightly.1 on a real install.** This release changed how
   the app *looks* more than how it works, and none of it has been seen in a
   real Tauri window — it was verified in the Vite dev server (computed styles,
   DOM state) plus `npm run check` and `cargo check`. Specifically worth
   checking: all three themes; the Windows title bar picking up the theme
   colour (and following a light↔dark↔sepia switch); focus mode `F11` and its
   top-edge peek; right-click in each region; a document with a wide table; a
   document with YAML front matter; clicking an external link.
2. **Finish the Tauri security baseline: API keys → OS keyring.** CSP, the tag
   filter and the `fs`-plugin removal all landed in v0.7.0. The remaining item
   is `anthropicApiKey` / `groqApiKey`, which sit in plaintext in
   `settings.json` via plugin-store. Needs `keyring-rs` plus get/set/delete
   commands and a one-time migration on read. Deliberately deferred out of this
   release because it adds a native dependency with three-platform CI risk, and
   the point of this nightly was to get the visual work testable.
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
8. **Mac-native polish** — v0.7.0 did the code-level pass (every shortcut label
   is platform-aware via `sk()`, focus mode uses ⌃⌘F, no traffic-light gutter
   because the title bar stays native), but *nobody has ever run a macOS
   build*. Still unverified there: the Theatre recede animation on WKWebView,
   the hover-peek gesture with a trackpad, `-webkit-scrollbar` styling against
   macOS overlay scrollbars, elastic overscroll versus the scroll-position
   restore maths, and whether tab tear-out works at all from inside a `.app`
   bundle (`spawn_window` re-execs `current_exe()`).
9. **Make the breadcrumb's `…` clickable** — a menu of the elided ancestors,
   each opening that folder in the Files panel. The context-menu primitive
   already exists.
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
