# Changelog

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
