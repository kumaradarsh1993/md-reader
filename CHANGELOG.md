# Changelog

## 0.6.0 — 2026-07-25 (Stable)

Reading-comfort release. Every tab keeps its own place, the outline tells you
where you are, the side panel gets out of the way when you want it to, and the
content-width control finally shows what it does.

### Added — Reading position memory + resume ribbon

- **Per-tab scroll positions.** Each tab now owns its scroll offset. Reading
  the bottom of one file and switching to another no longer drags the second
  file's view along with it — the long-standing complaint. Switching back puts
  you exactly where you were.
- **Resume across sessions.** Close md-reader, reopen the file, and you land
  where you stopped reading. Positions are stored per file path, capped at 200
  entries with the oldest evicted first.
  - Each position records *two* coordinates: the source line of the top-most
    visible block, and the scroll ratio. The line anchor is what survives a
    font-size, zoom or content-width change, and edits made below your reading
    position; the ratio is the fallback for when that block no longer exists.
- **The ribbon.** On resume, a hairline accent rule marks the spot with a small
  "you left off here" tag. It's bright for a few seconds, then settles to a
  whisper so it stays findable without competing with the text. Click the tag
  to dismiss it.
- **Gutter marker.** Once the ribbon has scrolled out of view, a slim marker
  appears in the right gutter at the mark's depth — click it to travel back.
  Same job as Word's scrollbar bookmark.
- Both are controlled in Settings → Reading position, along with a "Forget
  saved positions" button. Per-tab retention is unconditional; the setting
  governs only whether positions are written to disk for the next session.

### Added — Outline scroll-spy and visual rework

- **The outline follows you.** As you scroll, the heading whose section you're
  reading stays highlighted and the highlight travels with you. The active
  entry auto-scrolls into view within the outline when it drifts off.
- **New heading parser** (`src/lib/outline.ts`) — handles setext headings
  (`Title` over `===`), skips fenced code blocks, strips inline markdown from
  entry labels, and dedupes slugs exactly the way `post-render.ts` assigns
  them. Recognising setext isn't cosmetic: the renderer emits those as real
  `<h1>`/`<h2>`, so a parser that missed them desynchronised the outline from
  the document.
- **Navigation is line-based, not slug-based.** Clicking an entry resolves
  through comrak's `data-sourcepos`, so duplicate heading text now jumps to the
  right occurrence instead of always the first one.
- New `src/lib/view-nav.svelte.ts` carries active-line / progress state between
  the Viewer and the outline, using source lines as the shared coordinate.

### Fixed

- **"Outline" was rendered twice** in the side panel — the panel's section
  header and the outline component both drew the title.

### Added — Side panel: collapse, hover-peek, movable dividers

- **One button for the whole panel**, ChatGPT-style, at the left of the
  toolbar. Collapsing keeps your section choices intact so expanding restores
  exactly what you had. Previously the only way to clear the panel was to
  switch both sections off individually — which then lost those choices.
- **Hover-peek.** While collapsed, hover the window's left edge and the panel
  slides out over the content for as long as you need it, with a grace period
  so a diagonal mouse path doesn't kill it mid-reach. A pin button docks it.
- **Movable Files / Outline divider** — drag to give either section more room,
  double-click to reset.
- **Better width resizer** — pointer capture so fast drags don't drop the grab,
  double-click to reset, arrow-key resizing.
- The 📁 / 📑 buttons keep their existing job of choosing *what* the panel
  shows, and now also un-collapse it when you ask for a section.

### Changed

- **`Ctrl+B` now collapses / restores the side panel** rather than toggling the
  Files section specifically. It's the near-universal binding for that action
  (VS Code, ChatGPT, Obsidian), and the panel is the more useful thing to give
  the most memorable shortcut to.
- **`Esc` closes one layer at a time**, outermost first, and now also closes
  the diff sidebar.

### Changed — Content width control

- The `86ch` badge is gone. In its place is a miniature page with lines of text
  on it, where the text block is exactly as wide as your real content column.
  You read the current state at a glance and the mapping to the ‹ › buttons is
  self-evident — no unit vocabulary required.
- Three ways to drive it: the buttons (8ch steps), dragging across the page
  glyph, and the wheel. Double-click resets to the default. The number is still
  there, shown on hover, where it informs rather than clutters.
- Keyboard support on the glyph itself (arrows, Home/End, Enter for full width),
  with proper `role="slider"` semantics.

### Fixed — Live Edit Theatre audit

A full pass over the Theatre module. Everything below was a real defect.

- **Per-card LLM summaries showed the whole document.** The sidebar's ✨ Summary
  button always sent `snapshotBefore` / `snapshotAfter` for the entire turn and
  cached the result against the turn id — so the moment you asked one card for a
  summary, *every* card showed the same whole-document text. It now summarises
  that section's own before/after and caches per section, which is what the
  design doc asked for: summarise the one paragraph you care about without
  burning tokens on the whole file.
- **Leader lines only moved once every 400ms.** `SidebarConnectors` attached its
  scroll listener to `.content`, which isn't the scroll container (`.viewer`
  is), and scroll events don't bubble — so the listener never fired and the
  connectors relied entirely on a polling fallback. Fixed, and the always-on
  `setInterval` is replaced by a `ResizeObserver` + `MutationObserver` pair that
  costs nothing when the document is idle.
- **Summaries and per-card mode were lost on close.** Both lived in the
  sidebar's local state, and the sidebar unmounts whenever it closes — so every
  reopen re-fetched (and re-billed) the API. They now live on the `Turn`.
- **`Turn.startedAt` was always equal to `finishedAt`** (`Date.now() -
  (Date.now() - Date.now())`). The real turn-start timestamp is now captured
  when the turn opens, and the sidebar's turn picker shows how long the turn
  took — a 3-second nudge reads very differently from a 4-minute rewrite.
- **Dismissing mid-turn wedged the state machine.** `dismiss()` left
  `pendingTurnBefore` set, which made `finaliseTurn`'s phase guard reject the
  turn forever: the in-flight edits never reached the ring buffer and the
  sidebar reported "This turn (in progress)" indefinitely. Dismissing now
  finalises the turn first.
- **There was nothing to dismiss.** The status bar said "pause to dismiss"
  during an active turn while offering no control. It now has a real Dismiss
  button — which is what made the bug above reachable in the first place.
- **`ResumeChip`'s visibility test carried a clause that could never be true**
  once the preceding condition had been asserted. Reduced to what it meant.

### Added — Live Edit Theatre

- **Sidebar cards navigate.** Click a card's heading and the document scrolls to
  that section. Removed sections render as non-interactive with an explanation
  rather than a dead link.
- **Per-card change counts** — "6 lines changed", "12 lines added".
- Focus lands in the sidebar when it opens, and `Esc` closes it.

### Accessibility

- `prefers-reduced-motion` is now honoured throughout: the theatre's pulsing
  highlights, status-bar dot, chip and banner animations, the side panel's
  hover-peek slide, the resume ribbon's reveal, and the width control's
  transitions all stop moving. None of them carried information in the motion.
- Keyboard support on the new controls: arrow keys on the width glyph and on
  both panel dividers, `Home`/`End`, `aria-valuenow` / `aria-current` where
  they belong.

### Internal

- New `--accent-active` palette token (per-theme) for the outline's current-row
  fill. Defined per theme rather than derived with `color-mix()`, which isn't
  available on the older WebKitGTK that some Linux users will have — a silently
  dropped declaration there would have taken the dark-mode highlight with it.
- `npm run check` is at 0 errors, 0 warnings.

## 0.5.1 — 2026-05-15

### Added — Sepia reading theme + toolbar 3-way theme switch

- **Sepia theme** — a warm cream-paper palette tuned for low-strain
  long-form reading. Background `#f4ecd8`, text `#4a3f33` (≈6:1 contrast,
  comfortably above WCAG AA), warm-umber accents/links so the page reads
  as one coherent surface. Pick it from the new toolbar switch or
  Settings → Theme.
- **Toolbar theme switch** — a minimalistic 3-way segmented control on
  the right side of the header: ☀ Light · ◐ Sepia · ☾ Dark. One click,
  no menu. Stays in sync with the Settings → Theme value.
- **Code-block surface** now reliably uses the themed `--code-bg` instead
  of syntect's inline white — adds `!important` on `.viewer pre`
  background so sepia (and future themes) aren't subverted by syntect's
  hardcoded surface color.

### Settings

- `ThemeMode` extended to `"auto" | "light" | "dark" | "sepia"`. Existing
  values migrate unchanged.
- New helper `effectiveThemeName(theme)` in `settings-store.svelte.ts`
  resolves the user choice to the concrete `data-theme` attribute value.

## 0.5.0 — 2026-05-14

Theatre v2 — addresses three real-world issues with the v0.4.0 Live Edit
Theatre, plus adds a free LLM provider option for the diff sidebar's
summary mode.

### Changed — Theatre visual rework

- **Recede, don't shrink.** Replaced the v0.4.0 `transform: scale(0.78)`
  zoom-out (which left a floating mini-viewport with empty space around it)
  with a subtle surface "recede": gentle inset shadow + slightly muted
  saturation. Page stays full-size, layout doesn't break, the cue is still
  obvious without feeling like the app broke.
- **Two-phase highlights.** Edited blocks now glow **green with a soft
  pulse** while the AI is actively writing them, then fade to **yellow**
  ~1.5s after the last touch — instead of everything turning yellow at once.
  When a 100-paragraph file gets rewritten in stages, you see a wave of
  green sweep through, leaving yellow trails. Much easier to follow what's
  happening right now vs. what's happened earlier in this turn.
  - Driven by a new `previousSourceForDelta` per-tab snapshot, plus a
    decay loop that demotes fresh ranges to stale after the configured TTL.

### Added — Diff sidebar leader lines

- **Word-comments-style connectors.** Each card in the sidebar now draws a
  bracket on the right edge of its matching paragraph in the viewer and a
  thin curve back to the card. Scrolling either side keeps the connection
  attached (rAF-throttled redraws on viewer scroll / sidebar scroll / window
  resize). Off-screen cards or paragraphs are skipped — no leader lines
  trailing into chrome.
- New `src/lib/theatre/SidebarConnectors.svelte` — viewport-fixed SVG
  overlay, driven off the existing section list and `data-card-section-index`
  attributes on cards.

### Added — Multi-provider LLM (Groq + Anthropic)

- **Groq Cloud is now the default** smart-diff provider — free tier with no
  card. Settings → Smart-diff has a provider toggle and per-provider key +
  model fields. Defaults to `llama-3.3-70b-versatile`; other free-tier
  Llama 4 Maverick / Scout / 3.1-8B options in the model picker.
- **Anthropic remains** as the alternative, unchanged behaviour. Existing
  key carries over.
- New `src/lib/llm/` module: `types.ts`, `anthropic.ts`, `groq.ts`,
  `index.ts` (dispatcher with FNV-1a result cache).
- `src/lib/smart-diff.ts` removed — its sole caller (`DiffSidebar.svelte`)
  now imports from `$lib/llm`.

### Settings

- New: `llmProvider` (`"groq" | "anthropic"`, default `"groq"`),
  `groqApiKey`, `groqModel`.
- Existing `anthropicApiKey` / `anthropicModel` unchanged.

### Notes

- v0.5.0 ships on the **Nightly / Pre-release** channel. v0.3.0 remains the
  stable "Latest" badge on GitHub releases.

## 0.4.0 — 2026-05-13

### Added — Live Edit Theatre (opt-in, off by default)

The headline of v0.4.0 — a new product mode that activates when an external
edit is detected on the file you have open. Enable via
**Settings → Advanced features → 🎬 Live Edit Theatre**.

When enabled:

- **Smooth zoom-out animation** + faint background desaturation when an
  AI (Claude, ChatGPT, Cursor, etc.) starts writing to the active file.
  Reads as "I know something is happening — watch the show."
- **Bottom-left status bar** during the turn: live change count and a
  pulsing indicator. Morphs to "Edits done — X highlighted" with
  Dismiss / Show details buttons once edits stop for 5 seconds.
- **Yellow highlights** painted on every changed section via comrak's
  `data-sourcepos` mapping. Stay visible after dismiss; toggle with the
  floating "Show / Hide changes" chip top-right of the viewport.
- **Diff sidebar** (`Ctrl + Shift + D` or "Show details" button) — a
  Word-comments-style right panel listing every changed section as a
  card. Two modes per card:
  - **Naive diff** — red strikethrough / green underline inline diff via
    diff-match-patch. Fast, local, no network.
  - **✨ Summary** — prose summary by Claude, fetched on demand. Reuses
    the existing Smart-diff Anthropic API key from Settings.
- **Turn ring buffer** — the last 10 AI turns are kept in memory per tab.
  Dropdown at the top of the sidebar lets you re-view any of them as a
  frozen artefact ("v3 — 2 min ago") plus a cumulative "Since file
  opened" option. Lost on app close (in-memory only).
- **Discoverability tip** — users who haven't enabled Theatre yet see a
  one-time bottom-of-screen banner when an external edit first arrives.
  Click "Enable" to flip the toggle, or ✕ to dismiss.

### Stack additions

- `diff-match-patch` 1.0.5 (~30 KB) for naive-diff rendering.
- New `src/lib/theatre/` module: `types.ts`, `diff-engine.ts`,
  `store.svelte.ts`, `StatusBar.svelte`, `ResumeChip.svelte`,
  `TipBanner.svelte`, `DiffSidebar.svelte`.

### Architecture

- Theatre state lives on each `Tab` object (in-memory, lost on close —
  by design). 10-turn ring buffer caps per-tab memory at ~1 MB for a
  50 KB file. Bundle delta: ~30 KB. App startup time unchanged.
- External edits route through `tabs-store.setActiveSourceFromDisk`,
  which invokes `theatre/store.onBeforeExternalEdit` and
  `onAfterExternalEdit` to drive the state machine. Pure functions on
  reactive Tab fields — no separate state container.
- See `docs/proposals/live-edit-theatre.md` for the full design rationale,
  state machine, and the locked decisions from the 2026-05-13 debate.

## 0.3.0 — 2026-05-13

### Added
- **About dialog** — accessible from the File menu. Shows version, repo,
  license, and quick links to release page + bug/feature reports. Opens
  external links in the system browser (not the webview).
- **Advanced features** settings section — single toggle for Live Edit
  Theatre (stub in v0.3.0, full feature lands in v0.4.0). Off by default.

### Fixed
- **Tab tear-out z-order** — when you drag a tab out of the window, the
  new window now reliably comes to the front instead of opening behind
  the original window. Fixed on Windows by transferring foreground rights
  to the child PID via `AllowSetForegroundWindow` plus an explicit
  `set_focus()` on the child side.

### Changed
- **Toolbar cleanup** — `📡 Track` and `🔍 Diff` buttons removed entirely.
  The `Ctrl+L` and `Ctrl+D` shortcuts they backed are gone too. The
  features are being repackaged as Live Edit Theatre in v0.4.0 — see
  `docs/proposals/live-edit-theatre.md`.
- **Toolbar visual structure** — content-width and zoom now sit in two
  distinct segmented groups with a vertical divider between them and the
  find/settings cluster. The settings cog is slightly larger and more
  clickable.
- The `📡 live` middle-toolbar badge (file-changing pulse) was removed.
  v0.4.0 reintroduces the external-edit signal as the Theatre status bar.
- **Smart-diff** banner removed from the top of the viewer. The Anthropic
  API key in Settings stays — v0.4.0 will reuse it for the per-section
  LLM summary in the diff sidebar.

### Removed (settings)
- `experimentalLiveTrack`, `experimentalDiffMode` setting keys. The
  legacy `liveTrack` and `diffMode` keys are left in the schema for now
  so existing `settings.json` files load cleanly; they're ignored.

## 0.2.0 — 2026-05-11

### Added
- **Smart edit mode** — WYSIWYG markdown editing powered by
  [Milkdown / Crepe](https://milkdown.dev). Markdown symbols (`##`, `**`,
  `[…](…)`) are never visible while editing. Floating toolbar on selection,
  slash menu for blocks, inline tables, code blocks, KaTeX math. Becomes the
  new default for `Ctrl+E`. Switch to raw markdown source via the toolbar
  sub-toggle or Settings → Default edit mode.
- `editorMode` setting (`"smart" | "raw"`) — picks the default editor used
  when entering edit mode.
- Settings → Experimental section.
- `test-fixtures/round-trip.md` — grab-bag fixture for verifying round-trip
  fidelity in smart edit mode.

### Changed
- Live AI edit tracking and Diff mode (with the ✨ Why? smart-diff summary)
  have both moved to **Settings → Experimental**, off by default. The 📡
  Track button, 🔍 Diff button, and their `Ctrl+L` / `Ctrl+D` shortcuts
  are hidden until you opt in. Existing users with `liveTrack: true` or
  `diffMode: true` are migrated automatically.
- `Ctrl+E` now cycles **View ↔ Smart edit** (was View ↔ Split).
- The toolbar `View / Split / Edit` segmented control is now `View / Edit`.
  Split mode has been retired — use the Smart/Raw sub-toggle inside Edit
  to flip to the raw markdown source.
- The smart edit surface now visually mirrors the viewer (typography,
  content width, side panel) with only a faint paper-tint background
  difference to indicate the editing context.

### Migration
- The legacy `liveTrack` and `diffMode` setting keys are preserved for one
  release as migration sources. They will be removed in 0.3.

## 0.1.4 and earlier

See git history.
