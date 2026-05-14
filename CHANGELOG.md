# Changelog

## 0.5.1 — 2026-05-15 (Nightly / Pre-release)

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

## 0.5.0 — 2026-05-14 (Nightly / Pre-release)

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
