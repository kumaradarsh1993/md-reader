# Handover — Fox MD (repo: md-reader)

> Self-contained context for whoever (human or AI) picks up this project next.
> Last updated 2026-08-25: **v0.8.0 is stable `latest`** (the v0.8 reading-comfort
> pass: refresh from disk, mid-screen outline tracking, wrapping tables, a
> hover-only side-panel scrollbar, layered surfaces). **v0.9.0-nightly.1** opens
> the next line: Page preview (Word geometry, real page count), the resume
> bookmark rebuilt as one dismissible margin mark, Settings as a right-hand
> drawer, and file-list sorting.

## Where things stand

**Release channel policy (2026-08-25):** **v0.8.0 is stable `latest`**, cut from
the same commit as `v0.8.0-nightly.2` at the owner's explicit "put it as a
stable". New work goes on `v0.9.0-nightly.N`. The v0.7 and v0.8 nightly draft
releases are kept as drafts and should not be promoted.

| Version | Status | Headline |
|---|---|---|
| v0.2.0 | Published (stable) | Smart edit mode + user-first README + CI workflow |
| v0.3.0 | Published (stable) | Toolbar cleanup, About dialog, tab tear-out z-order fix |
| v0.4.0 | Published | Live Edit Theatre + Diff Tracker sidebar |
| v0.5.0 | Published | Theatre v2: recede-not-shrink, fresh/stale highlights, leader lines, Groq |
| v0.5.1 | Published | Sepia reading theme + toolbar 3-way theme switch |
| v0.6.0 | Published (stable) | Reading-position memory, outline scroll-spy, collapsible side panel, visual width control, Theatre audit |
| v0.7.0 | Published (was stable until 2026-08-25) | Fox MD identity + icon, chrome/paper redesign, focus mode, context menus, renderer fixes, completed security baseline |
| v0.8.0-nightly.1 | Tagged → CI draft | Refresh from disk (button / `Ctrl+R` / `F5` / on window focus); outline tracks the mid-screen reading line |
| v0.8.0-nightly.2 | Tagged → CI draft | Tables wrap; hover-only panel scrollbar; layered surface style + sectioned Settings; files-panel polish |
| **v0.8.0** | **Published — stable `latest`** | The v0.8 reading-comfort pass, promoted from nightly.2 unchanged |
| v0.9.0-nightly.1 | Tagged → CI draft | Page preview (Word geometry + real page count); resume bookmark rebuilt; Settings drawer; file sorting |

- **Repo**: <https://github.com/kumaradarsh1993/md-reader>
- **Branch**: `master`. v0.6.0 onwards was committed straight to master
  at the user's explicit request.
- **Vite dev port**: `1430` (a sibling Tauri project keeps 1420)
- **Local git identity (repo-local, not global)**: `Kumar Adarsh <kumaradarsh1993@users.noreply.github.com>`

### Identity and upgrade continuity

- **Displayed name:** Fox MD.
- **Repo / npm package / Rust crate / executable:** still `md-reader`.
- **Bundle identifier:** still `com.mdreader.app`.
- **MSI upgrade code:** explicitly pinned to
  `0c8e8201-1ef4-56d2-9b1d-a0a5203f2c69`, the value derived from the old
  product name. Do not regenerate it: changing it installs a duplicate app.
- **NSIS rename migration:** `src-tauri/installer-hooks.nsh` runs the old
  `md-reader` per-user uninstaller with `/S /UPDATE` before Fox MD is copied.
  Do not remove it until pre-0.7 installs are no longer supported.
- **Icon source:** `assets/fox-md-icon.png`; the old mark is backed up at
  `assets/legacy-md-reader-icon.png`. Regenerate native assets with
  `npm run tauri -- icon assets/fox-md-icon.png`.

## What v0.8.0-nightly.1 added

Two complaints, one theme: the app was confidently showing something that was
no longer true.

### Refresh from disk

- `src/lib/refresh.svelte.ts` (`refresher`) is the single entry point. It calls
  `tabs.reloadAllFromDisk()` and then bumps a `tick` counter that
  `FileBrowser.svelte` watches, so the folder listing and the open tabs come
  back together. Surfaces: a toolbar button beside **File**,
  `Ctrl/⌘+R`, `F5`, File → Refresh from disk, the shell right-click menu, and
  the file-browser right-click menu — all one code path.
- **`Ctrl+R` and `F5` are `preventDefault`ed.** In a webview those mean "reload
  the page", which here would discard the whole session's tab state to achieve
  strictly less than refresh does.
- **Automatic sweep on `window.focus`**, coalesced at 400ms and silent (no
  spinner). This is the one that actually fixes the reported problem: the
  changes come from a terminal or an editor, so the moment you look back at Fox
  MD is the moment it is most likely to be stale.
- **Dirty tabs are skipped, unconditionally.** A refresh that could discard
  unsaved edits would be a worse bug than the staleness it fixes. Missing files
  are counted, not closed.
- **Why this exists at all — do not "simplify" it away:** `watcher.rs` arms on
  exactly *one* file, the active tab, and emits only that path. Background tabs,
  new files appearing in the open folder (the listing is read once, on entry),
  and every synced/virtual filesystem where `ReadDirectoryChangesW` is
  unreliable all fall straight through it. Extending the watcher to a *set* of
  files is the deeper fix and is still open; refresh is the escape hatch that
  works regardless. Torn-out windows are separate OS processes, so no refresh
  can cross windows — each one sweeps itself on focus, which is why the focus
  hook matters more than the button.

### The outline follows a reading line, not the top border

- `readingFraction()` in `Viewer.svelte` decides where in the viewport the
  "reading line" sits: **the middle**, ramping to the true top within the first
  half-screen of scrolling and to the true bottom within the last (documents
  shorter than two screens just get shorter ramps and no flat middle; nothing
  scrollable → the top). `publishNav()` probes the block/heading indexes at that
  line instead of `container.top + 12`.
- That single change fixes both halves of the complaint: with three sections on
  screen the one you are *looking at* is lit rather than the one touching the
  top border, and hitting the bottom of the document finally moves the mark to
  the last section — previously impossible for any final section shorter than
  the viewport, since it could never reach the top border.
- **Ramps, not snaps.** A hard "top edge below 50% scroll, middle above" rule
  would make the highlight jump a section on a one-pixel scroll. The ramp is
  monotonic and continuous end to end.
- The progress rail is now derived from the same reading line
  (`readY / scrollHeight`), so the bar and the lit entry cannot disagree.
- **`topOfViewport()` still exists and is still top-anchored** — it feeds
  `currentMark()`. Reading position is restored with `scrollBlockToTop`, so the
  mark must name the block that was at the top. Do not "unify" these two probes.
- `viewNav.topLine` was renamed `viewNav.readingLine`, because "top" had become
  actively wrong.

## What v0.9.0-nightly.1 added

### Page preview (`src/lib/WordPreview.svelte`)

The workflow it serves: drafts are written here as markdown (often by an agent),
then have to go to a team as a Word document in the house format. The only
question before exporting is *how long is it and where do the pages break*, and
answering it used to mean actually converting the file.

- **It is a preview, not a converter.** Nothing is written; no .docx is produced.
- Geometry: US Letter (816×1056 px at 96dpi), Word "Normal" margins (1in), text
  column 624px, 9in of content per page. Body 11pt Calibri Light, line-height
  1.37 (Word's 1.08 multiple), 8pt paragraph spacing.
- **How pagination works, because this is the part worth not breaking:** the
  content is laid out *once*, off-screen, at exactly the text-column width.
  Every visual line is measured with `Range.getClientRects()` — one rect per
  line box, which is why wrapped paragraphs, tables and headings are all
  countable without assuming a line height. Rects that overlap vertically are
  merged (a bold run, an inline code span, a table row's cells are one line).
  Page breaks then land on the **last line boundary** that fits inside 9in, so a
  line is never sliced across a break. Each page renders a clipped window onto
  the same content, offset to its slice.
- The measured line array does double duty: margin line numbers and break
  positions come from the same data, so they cannot disagree.
- **`MIN_TAIL` exists for a real bug**: `scrollHeight` rounds up to a whole pixel
  while the last line's bottom is fractional, so an exact end-comparison left a
  1.5px sliver and reported one page too many. Measured before/after: a 3-page
  document reported 4.
- Measurement waits on `document.fonts.ready` and image loads. A page count
  measured before the webfont lands is confidently wrong.
- `content-visibility: auto` on each page — the content is duplicated per page,
  so a 40-page document would otherwise lay out 40 copies on every scroll.
- Verified by measurement in the browser pane: 88 lines, 3 pages, 35/35/18 line
  numbers, every painted number's Y matching its source line's midpoint to 0.0px.

### Resume bookmark → `ResumeMarker.svelte` (replaces `ResumeRibbon.svelte`)

- One element, `position: fixed` in the right margin. Never crosses the text.
- Tracks the anchor while it is on screen; pins to the nearer viewport edge with
  a ▲/▼ when it is not — which doubles as "scroll this way to get back".
- Dismiss is on the mark itself, so the thing you can see is the thing you can
  remove. The old design put the tag on the left and the pill on the right.
- **Auto-retires** once the reader is `RESUME_RETIRE_SCREENS` (1) viewport past
  it; that call goes through the same `onDismissResume` the ✕ uses.
- The `resumeRibbon` settings *key* is unchanged (persisted), only its label.
- Note the prop is `anchor`, not `state`: a local binding called `state` shadows
  the `$state` rune and svelte-check reports every use as a store subscription.

### Settings drawer, file sorting, and the descender bug

- Settings is a full-height right-hand drawer (≤560px) with a sticky header.
- `list_dir` now returns `modified` (ms epoch, `Option<u64>`); sorting is done in
  the frontend so switching order costs no disk read. Folders first in both
  orders; entries with no mtime sort last rather than pretending to be 1970.
- **The descender bug is worth remembering as a pattern:** `line-height: 1` on a
  box with `overflow: hidden` has nowhere to put a descender, so every p/y/g/j is
  sliced at the stem. It was in `.cm-item` (context menus), and the same shape
  was latent in both crumb trails. If you set `line-height: 1`, make sure
  nothing inside is clipping.

## What v0.8.0-nightly.2 added

### Tables wrap (`Viewer.svelte`, the `.table-scroll` block)

- `width: max-content` was the single line behind "why do I have to scroll a
  three-column table sideways". It asks for the width the table would take with
  no line breaking anywhere, which is the right answer for a table of file
  paths and the wrong one for a table of sentences. Now `width: 100%` with
  `table-layout: auto`, so columns are sized in proportion to their content.
- **`min-width: 7ch` on cells is what keeps the scroller meaningful.**
  `overflow-wrap: anywhere` lets any cell shrink to one glyph, so without a
  floor a twelve-column table would "fit" at four characters a column instead
  of scrolling. Measured: a 3-column prose table lays out 84/354/360px in an
  798px column with no overflow; a 12-column table overflows to 1008px and
  scrolls. Change one of these two rules and re-measure both cases.

### Hover-only scrollbars in the side panel

- Scoped to `.panel-stack`, **not** `.panel` — the Settings dialog uses
  `.panel` too.
- Only the thumb's colour is hidden. `scrollbar-width: none` would reflow the
  list every time the pointer entered the panel.
- The document scroller keeps its permanent bar deliberately: it is the one
  place the position information is worth the ink.

### Surface style: layered vs flat (`surfaceStyle` setting)

- Four chrome tokens, outermost first: `--titlebar-bg`, `--toolbar-bg`,
  `--side-bg`, `--chrome-bg` (the desk), then `--bg` (paper). In `flat` they
  collapse to one colour — byte-identical to v0.7. In `layered` each takes a
  2–4% step.
- **The rule, so future palette edits stay coherent: tone tracks distance from
  the document.** Paper is the extreme of the range; every surface further out
  steps back toward mid-grey. In light and sepia that is darker going outward,
  and in dark it is *also* darker going outward, because there the paper is the
  lightest thing on screen. One rule read in two directions.
- Applied via `html[data-surface]`, a separate axis from `data-theme`, so it is
  3 themes × 2 styles from one extra field. Specificity does the matching —
  `html[data-surface][data-theme=…]` (0,2,1) beats `html[data-theme=…]`
  (0,1,1) — so no `!important` and no dependence on source order.
- The Windows title bar reads `--titlebar-bg` now, not `--chrome-bg`. The
  effect must depend on `settings.s.surfaceStyle` or the caption colour goes
  stale when the style changes.
- `--toolbar-border` was a declared-but-unused token; it is now the toolbar's
  hairline, drawn as a `box-shadow` so flat mode keeps its exact 46px.

### Settings, sectioned

- Five headings (Appearance / Side panel / Reading / Editing / Advanced). The
  Smart-diff provider + API key fields moved inside Advanced and render only
  when `advancedLiveEditTheatre` is on — they configure nothing otherwise.

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
| `src/lib/settings-store.svelte.ts` | Settings schema + scroll-memory persistence. API keys are memory-only here; it migrates old plaintext values into the keyring and writes a marked fallback only after a genuine native-store failure. |
| `src-tauri/src/secrets.rs` | Allow-listed Groq/Anthropic get/set/delete commands backed by Windows Credential Manager, macOS Keychain or Linux Secret Service. Service stays `com.mdreader.app` across the rename. |
| `src/lib/tabs-store.svelte.ts` | Per-tab state: source, baseline, scroll/resume marks, theatre fields. `reloadAllFromDisk()` is the refresh path — it skips dirty tabs on purpose. |
| `src/lib/refresh.svelte.ts` | The refresh command (button / `Ctrl+R` / `F5` / window focus). Bumps `tick`; `FileBrowser` re-lists on it. |
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

1. **Real-install visual smoke test.** The code gates and 32/128/1024px icon
   assets are verified, and CI builds all platforms, but the final Fox MD shell
   should still be looked at in an installed Windows and macOS build when
   convenient: title bar, Start/Dock icon, About icon, focus mode and all three
   themes.
2. **Enable GitHub Discussions** (Settings → General → Features). The
   issue-template `config.yml` already routes questions there.
3. **Record demo assets.** Storyboards in `DEMO.md`. Hero GIF + 5 README
   screenshots are the minimum. The new resume-ribbon and width control are
   both very demoable.
4. **Post the launch.** `LINKEDIN_POST.md` has the current business-audience
   drafts; update the product name and final stable link before posting.

### Medium priority

5. **Multi-provider LLM support** beyond Groq/Anthropic (Gemini free tier).
6. **Mac-native polish.** The code-level pass is *done* as of
   `v0.7.0-nightly.2`: every shortcut label is platform-aware via `sk()`, focus
   mode uses ⌃⌘F, there is no traffic-light gutter (the title bar stays
   native), elastic-overscroll no longer corrupts the saved reading position,
   and tab tear-out goes through `open -n -a` so LaunchServices sees the new
   instance. But *nobody has ever run a macOS build*, so these are reasoned
   fixes, not observed ones. Still unverified by eye: the Theatre recede
   animation on WKWebView, the hover-peek gesture with a trackpad,
   `-webkit-scrollbar` styling against macOS overlay scrollbars, and whether
   `open -n -a` actually produces the second window (the fallback path means a
   failure degrades rather than breaks).
7. **Make the breadcrumb's `…` clickable** — a menu of the elided ancestors,
   each opening that folder in the Files panel. The context-menu primitive
   already exists.
8. **Nested folder tree** in the file browser (currently single-level).
9. **Outline drag-to-reorder sections** would be a natural next step now that
    the outline knows exact source lines for every heading.

### Low priority

10. Auto-update mechanism (Tauri 2 supports it; needs a signing key).
11. Code-signed builds for Windows + Mac.

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
