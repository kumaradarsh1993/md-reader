# md-reader

Lightweight cross-platform Markdown viewer — built for the moment when Claude
or ChatGPT writes a long `.md` and you just want to **read it**, not set up a
vault, not click through a folder-trust modal, not lose a third of your screen
to a sidebar.

Status: pre-alpha. Frontend builds; Rust backend requires a local Rust
toolchain to compile.

## What it does

- Double-click a `.md` file → opens fully rendered, full window
- **Live-reload** — re-renders as the file changes on disk (watch Claude write
  it in real time)
- View / Split / Edit modes with `Ctrl+E` toggle
- Zoom (`Ctrl +/-/0`), max-width (narrow / wide / full), light/dark/auto theme
- Find in document (`Ctrl+F`)
- Outline sidebar with click-to-jump
- GFM: tables, footnotes, task lists, alerts, strikethrough, autolinks
- Code fences with syntax highlighting (syntect, server-side)
- KaTeX math (`$x^2$` and `$$ \int x \,dx $$`)
- Mermaid diagrams (lazy-loaded only when present)
- Single-instance: opening a second `.md` reuses the running window

## Requirements

- **Node.js 20+** for the frontend toolchain
- **Rust 1.78+** + Cargo for building the Tauri shell
- Platform build tools:
  - **Windows:** Microsoft C++ Build Tools (MSVC) + WebView2 (preinstalled on
    Windows 10/11 since 2022)
  - **macOS:** Xcode Command Line Tools
  - **Linux:** `webkit2gtk-4.1`, `libgtk-3-dev`, `libayatana-appindicator3-dev`,
    `librsvg2-dev`, `libssl-dev`

Install Rust via [rustup](https://rustup.rs).

## Develop

```bash
npm install
npm run tauri dev
```

Frontend-only (no Rust required):

```bash
npm run dev      # Vite dev server on :1420
npm run build    # static build into ./build
npm run check    # svelte-check
```

## Build a release

```bash
npm run tauri build
```

Outputs:
- Windows: `src-tauri/target/release/bundle/nsis/*.exe` (per-user installer)
- macOS: `src-tauri/target/release/bundle/dmg/*.dmg`
- Linux: `src-tauri/target/release/bundle/{appimage,deb}/`

## Architecture

```
src-tauri/         Rust shell (Tauri 2)
  src/markdown.rs  comrak + syntect → HTML
  src/watcher.rs   notify-debouncer-full → emit "file-changed"
  src/commands.rs  IPC: open_file, save_file, render_markdown, watch/unwatch
  src/lib.rs       plugins (single-instance, fs, dialog, store), CLI args

src/               SvelteKit frontend (Svelte 5 runes, adapter-static)
  routes/+page.svelte  app shell
  lib/Viewer.svelte    HTML render + post-processing
  lib/Editor.svelte    CodeMirror 6 (lazy)
  lib/Toc.svelte       outline sidebar
  lib/Find.svelte      Ctrl+F find bar
  lib/Settings.svelte  zoom / theme / max-width / font
  lib/post-render.ts   lazy KaTeX + Mermaid rendering
  lib/api.ts           typed wrappers around invoke()
  lib/settings-store.svelte.ts  persisted settings (tauri-plugin-store)
```

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file |
| `Ctrl+E` | Toggle View ↔ Split |
| `Ctrl+S` | Save (in edit/split mode) |
| `Ctrl+F` | Find in document |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |
| `Esc` | Close find / settings |

## License

MIT
