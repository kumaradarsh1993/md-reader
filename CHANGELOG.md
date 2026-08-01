# Changelog

## 0.7.0 — 2026-08-01 (Stable)

The "stop looking like a developer tool" release. v0.6 was, in the owner's
words, 95% there — but it read as something built for the person who built it.
This pass is mostly about the other 5%: what the app appears to be made of,
where its boundaries are, and what happens when you right-click.

It also fixes a set of renderer defects found by a source audit, several of
which had been silently wrong since v0.1.

### Changed — Fox MD identity

- **The app is now Fox MD.** Window titles, installer identity, About,
  documentation, release presentation and the landing page all use the new
  name. The technical bundle identifier, executable name and MSI upgrade code
  stay stable so an existing md-reader install upgrades in place instead of
  appearing as a second app. The NSIS installer also detects and removes the
  old per-user `md-reader` entry in updater mode before installing Fox MD,
  preserving application data while preventing duplicate Add/Remove entries.
- **New warm paper-and-tail icon.** A parchment page wrapped by an abstract
  cinnamon ribbon gives the app a fox-family cue without using a literal fox
  or overlapping the bright character mark of Whisper Fox and the angular
  mascot of FoxCull. Native PNG, ICO, ICNS and Windows tile assets were all
  regenerated from the same 1024px source. The previous turquoise/yellow mark
  remains in `assets/legacy-md-reader-icon.png` as the backup source.

### Changed — chrome and content are now different materials

The complaint behind most of this release was that the side panel "looks too
similar to the text I'm reading" and the tab bar "mixes too much with the
text". Both were true, and the cause was measurable rather than a matter of
taste:

- **In dark mode the side panel and the document were the same colour.**
  `--side-bg` and `--bg` were both `#1c1c1e` — byte-identical. There was no
  surface boundary to see, only a hairline.
- **The tab strip was painted from a token shared with the document** (table
  headers, `<kbd>`). In dark mode that made the tab strip the *brightest*
  surface in the window — brighter than the page being read.

The fix is not a louder border. The application shell is now its own material
(`--chrome-bg`), and the document is a **sheet resting on top of it**: one
rounded corner where it meets the panel and the tab strip, a hairline ring, and
a whisper of shadow. In dark mode the sheet is *lighter* than the shell, which
is the convention every modern dark interface converged on.

Counter-intuitively the light-mode tonal gap got **smaller** (6.7% → ~3.5%),
not bigger. The field separates chrome from content with an edge, not with
tone; a large tonal step is what reads as "IDE". The palette also moved warm —
blue now sits a few points below red in every surface token.

- **The glass toolbar is gone.** It carried `backdrop-filter: blur(20px)` over
  an opaque fill, as a flex sibling of the content — so there was never
  anything behind it to blur. It cost a compositor layer and a stacking context
  (which the File menu had to be teleported out of) for zero pixels of effect.
- **Tabs are rounded chips** on the shell, with the active one filled in the
  *paper* colour so it reads as a hole punched through to the document. The 1px
  dividers between tabs and the 2px accent stripe on the active one — the
  strongest "developer tool" tells in the window — are gone.
- **The tab strip now belongs to the document column** rather than spanning the
  whole window above the side panel, so the panel is full height and every tab
  sits directly above the page it opens.
- **Emoji are no longer used as icons.** The folder, outline, gear, magnifier
  and theme glyphs are a real inlined icon set now. Emoji cannot inherit
  `currentColor`, so a "muted" toolbar button was rendering a full-saturation
  yellow folder.
- **Section headers are sentence case** ("Files", "Outline") instead of 10.5px
  uppercase micro-labels, and each section's dismiss control appears on
  approach rather than sitting there permanently.
- The side-panel toggle is now the leftmost control in the toolbar, ahead of
  the File menu — it governs window layout, and layout controls belong at the
  outside edge.
- Find and Settings are larger, and Settings is a sliders glyph rather than a
  cog that read as a circle at 17px.

### Added — the document's location, as a breadcrumb

The toolbar used to print the raw path. That is a string a developer reads and
everyone else skips: the one part that matters is buried at the end. It is now
a breadcrumb — muted ancestors, chevron separators, weighted file name, elided
from the *left*, because the drive letter never carries meaning.

### Added — Focus mode

`F11` (⌃⌘F on macOS, where F11 belongs to Mission Control) hides the toolbar,
the tab strip and the side panel, and takes the window fullscreen. `Esc` or the
same key leaves. Pushing the pointer to the very top edge slides the toolbar
back down for as long as you need it — the difference between a focus mode and
a trap — and a one-shot toast on entry says how to get out.

### Added — real right-click menus

Right-clicking anywhere used to produce the WebView's own page menu: Back,
Reload, **Save as**, Print, Inspect. Every entry was either meaningless in a
document reader or actively wrong. That menu is suppressed app-wide now and
replaced with contextual ones:

| Where | What you get |
|---|---|
| A tab | Close / close others / close to the right, open in new window, copy name or path, reveal in Explorer |
| The tab strip | Open file, close all |
| The document | Copy selection, find selection, open or copy a link, copy a link to the section, back to top, reload from disk |
| A file row | Open, open in new window, copy name or path, reveal |
| The file list | Up, refresh, copy folder path, reveal |
| An outline entry | Jump, copy heading text, copy link to section |
| The breadcrumb | Copy file name / full path / folder path, reveal |

Text fields keep the native menu on purpose — it is the only place "Paste"
lives.

### Fixed — renderer defects

- **YAML front matter rendered as a giant `<h2>`.** With no front-matter
  delimiter configured, comrak parsed the closing `---` as a *setext underline*
  for the metadata above it. Every document with front matter opened with a
  heading reading "title: … author: …", which also became the first entry in
  the outline.
- **Every in-document anchor link was dead.** Heading ids carried an `h-`
  prefix, so a hand-written table of contents — standard in long AI-written
  documents — linked to `#vertical-rhythm` while the id was
  `h-vertical-rhythm`. Nothing ever resolved. Slugs now match GitHub's
  algorithm and are Unicode-aware, so `## Résumé` and `## 概要` no longer
  collapse to the same empty slug.
- **External links navigated the entire app away.** There was no click handler
  on the rendered document at all. One misclick in a README replaced the app
  with a web page, in a window with no address bar, no Back button and no
  reload — recoverable only by closing the window. Links now open in the real
  browser, relative `.md` links open as a tab, and `#anchors` scroll.
- **Wide tables were clipped and unreachable.** `overflow-x: auto` does nothing
  on `display: table`, and the viewport clips. Tables are wrapped in a real
  scroller now (which inherits `data-sourcepos`, so scroll-restore, live-follow
  and diff highlighting still see them).
- **GFM column alignment was silently discarded.** `:---:` and `---:` produce
  `align=` attributes, which a blanket `text-align: left` beat every time.
- **Long inline code and URLs overflowed the column and were clipped**, with no
  way to scroll to them. A 62-character Windows path is ~80% of the text
  column.
- **Sepia used the light syntax-highlighting theme**, calibrated for white, on
  a cream background. It has its own now.
- **Task list items sat on a different left edge than plain bullets** in mixed
  lists.
- **Badge rows stacked vertically** — the `p > img` rule never matched the
  standard `[![alt](badge)](link)` shape, because the image's parent is the
  link, not the paragraph.
- **`<div align="center">` half-worked**: a `!important` text-align kept the
  heading hard-left while everything around it centred.
- Settings failing to load no longer aborts the rest of startup — which
  previously took the entire keyboard with it.

### Changed — typography

- **Vertical rhythm.** There was not one adjacent-sibling rule in the prose
  stylesheet; every gap was decided in isolation and resolved by margin
  collapsing. An `h2` followed by its own first `h3` opened a 33px gulf, lists
  did not group with the sentence introducing them, and consecutive list items
  sat 3px apart while the lines *inside* an item sat 26px apart.
- **The type scale stopped flatlining.** h5 was exactly body size with weight
  600 and a strong colour — character-for-character how `**bold**` is styled,
  so `##### Heading` and a bold lead-in were pixel-identical. h4 now outweighs
  `strong`, and h5/h6 differ by shape (small caps) rather than by size.
- **Default measure 86ch → 76ch**, and the column's gutter is no longer
  subtracted from it. The old setting delivered ~95 characters of type and
  drifted as the window resized.
- **Tables** use horizontal rules instead of a full grid plus zebra striping.
  The zebra was a 1.6% step in light mode (invisible), and in sepia the header
  fill and the zebra fill were *the same value*, so the header vanished into
  the body.
- **Blockquotes are full-contrast.** In these documents blockquotes carry the
  highest-stakes content; muting them inverted the author's emphasis, and
  failed WCAG AA in sepia at 3.5:1.
- **Links are underlined.** Colour alone was the only cue, at ~1.8:1 against
  body text in sepia.
- **GFM alert colours** were GitHub's *dark* tokens used in all three themes —
  all five failed contrast in light and sepia.
- Code blocks get a language label and a copy button.
- `<details>` / `<summary>` are styled rather than falling back to UA defaults.
- Definition lists, superscript, subscript and relaxed task markers (`[-]`,
  `[~]`) are enabled — two of them had matching CSS sitting dead in the
  stylesheet since v0.1.
- Added a print stylesheet.

### Added — the title bar follows the theme

The one strip of the window the app doesn't draw was being coloured by the OS,
so a dark Windows with the app in sepia produced a black bar above a cream
page. Windows now gets exact caption, text and border colours via DWM; macOS
gets a matching light/dark appearance. Sepia counts as light.

### Fixed — macOS and Linux

Every user-visible shortcut label was hardcoded to "Ctrl" and now renders ⌘ on
macOS. The traffic-light gutter was deliberately *not* added: the window keeps
a native title bar, so the lights sit above the toolbar and reserving space for
them would open an empty hole. Focus mode uses ⌃⌘F there rather than F11, which
belongs to Mission Control.

Four further cross-platform defects, three of them introduced by this release's
own changes and caught in review:

- **Reading position was lost by rubber-band scrolling.** macOS reports a
  *negative* `scrollTop` when you overscroll past the top. That negative ratio
  was persisted and then floored to zero on the way back in — so letting go of
  the trackpad at the top of a document silently reset "resume where you left
  off" to the very beginning. The ratio is clamped at capture now, not only at
  restore. Windows never showed this: WebView2 has no elastic overscroll.
- **Standalone images would not have centred on Linux.** The new rule relied on
  `:has()`, and an unsupported `:has()` invalidates the entire selector — so on
  the WebKitGTK build the `.deb`/AppImage may run against, every figure would
  have stayed inline. A plain `p > img:only-child` rule now carries the common
  case, with the `:has()` variant as an enhancement on top.
- **Dark-mode alert tints used `color-mix()`**, against this codebase's own
  documented convention of avoiding it for exactly this reason. Written out as
  explicit `rgba()` per alert type.
- **Tab tear-out on macOS** re-executed the binary inside the `.app` bundle
  directly. That starts a process and shows a window, but LaunchServices never
  learns about it, so the new window gets no Dock representation and doesn't
  reliably come forward — the same class of problem `AllowSetForegroundWindow`
  solves on Windows. It now uses `open -n -a` to launch a real second instance
  of the bundle, falling back to direct exec for non-bundled dev builds.

The Rust helper for that last one is deliberately not `cfg`-gated, so it is
type-checked by `cargo check` on the Windows dev machine — the macOS build only
ever happens in CI, and untypechecked platform code is how a typo surfaces
forty minutes later.

### Security

The workspace Tauri baseline, which was owed on this project before its next
stable:

- Updated the Svelte, Vite, Mermaid, DOMPurify, and related dependency line.
  The production audit now has no high, moderate, or critical findings (three
  low-severity transitive `cookie` advisories remain without a current patched
  SvelteKit release).

- **CSP was `null`; it is a strict policy now.** Combined with unfiltered raw
  HTML, that was a real execution path rather than a theoretical one — this app
  opens arbitrary `.md` files from disk.
- **GFM's tag filter is on**, neutralising `<script>`, `<iframe>` and friends.
  Everything raw HTML is actually wanted for — `<details>`, `<div align>`,
  badges, comments — still renders.
- **The `fs` plugin and its unscoped read/write capabilities are gone.** The
  frontend never imported it; all file access goes through commands using
  `std::fs`. Granting the webview filesystem access bought nothing and,
  alongside the two items above, completed an exfiltration path.

- **Optional Groq and Anthropic API keys now live in the OS keyring** — Windows
  Credential Manager, macOS Keychain or Linux Secret Service. On first launch,
  a legacy plaintext value is migrated and removed from `settings.json` only
  after the secure write succeeds. A marked file fallback is created only when
  the native keyring genuinely fails, then retried on the next launch. This
  closes the final item in the workspace Tauri security baseline.


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
