# Changelog

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
