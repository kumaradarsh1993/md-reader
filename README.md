# md-reader

> The viewer for AI-generated Markdown — re-renders as Claude, ChatGPT, or
> Cursor write. No vault. No setup. Double-click a `.md` file and read it.

[Landing page](https://kumaradarsh1993.github.io/md-reader/) ·
[Releases](https://github.com/kumaradarsh1993/md-reader/releases) ·
**MIT**

Lightweight cross-platform Markdown viewer/editor built with Tauri 2 + Rust +
Svelte 5. Targets the gap that existing tools don't fill: a fast, focused
reader for the long Markdown your AI just wrote, on Windows / macOS / Linux,
without the setup overhead of a PKM tool.

## Features

- **Live-reload** — open a file, run Claude in another terminal, watch
  content appear. Smart-scroll follows the edit only if you're nearby (no
  yanking) using `data-sourcepos` from comrak to map line changes to DOM
  nodes. Brief flash highlights what just changed.
- **Multi-tab** — drop multiple files to open as tabs, drag tab outside the
  window to spawn a new window (Chrome-style tear-out).
- **Side panel** — Lightroom-style stack: Files browser + Outline. Each
  toggles independently. Drag the right edge to resize.
- **GFM-perfect** — alerts (NOTE/TIP/IMPORTANT/WARNING/CAUTION with proper
  GitHub-style icons), tables with alignment, task lists, footnotes, KaTeX
  math, Mermaid diagrams, syntect-highlighted code blocks.
- **Continuous content width** — slider 40–160ch + full-window toggle. No
  more locked narrow band like MarkText.
- **Apple-leaning UI** — system fonts, hairline borders, glassy toolbar
  with backdrop-blur, iOS-style segmented controls, generous typography.
- **Keyboard-first** — every action has a shortcut.
- **Local-only** — no network, no telemetry, no accounts.
- **~10 MB installer** — Tauri 2 + WebView2, not a Chromium bundle.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+T` / `Ctrl+O` | Open file in new tab |
| `Ctrl+W` | Close active tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle tabs |
| `Ctrl+E` | Toggle View ↔ Split |
| `Ctrl+S` | Save (edit/split mode) |
| `Ctrl+F` | Find in document |
| `Ctrl+,` | Settings |
| `Ctrl+B` | Toggle files panel |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Zoom |
| `Ctrl+]` / `Ctrl+[` | Wider / narrower content column |
| `Ctrl+\` | Toggle full-window content width |
| `F12` | Open DevTools (dev only) |
| `Esc` | Close find / settings / file menu |

## Build from source

Requirements:

- **Node.js 20+**
- **Rust 1.78+** (via [rustup](https://rustup.rs))
- Platform C++ toolchain:
  - **Windows:** Microsoft C++ Build Tools + WebView2 (preinstalled on Win10/11)
  - **macOS:** Xcode Command Line Tools
  - **Linux:** `webkit2gtk-4.1`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`

```bash
git clone https://github.com/kumaradarsh1993/md-reader
cd md-reader
npm install
npm run tauri dev      # dev mode with HMR
npm run tauri build    # produces installer in src-tauri/target/release/bundle/
```

Frontend-only (no Rust required):

```bash
npm run dev    # Vite dev server on :1420
npm run check  # svelte-check
```

## Architecture

```
src-tauri/                      Rust backend (Tauri 2)
  src/markdown.rs               comrak + syntect → HTML, with data-sourcepos
  src/watcher.rs                notify-debouncer-full, watches parent dir
  src/commands.rs               IPC commands (file ops, list_dir, spawn_window)
  src/lib.rs                    plugins, CLI args, single-instance
  examples/inspect.rs           diagnostic harness — dump rendered HTML

src/                            SvelteKit frontend (Svelte 5 runes)
  routes/+page.svelte           app shell
  lib/Viewer.svelte             rendered output + live-follow
  lib/Editor.svelte             CodeMirror 6 (lazy)
  lib/TabBar.svelte             tabs with drag-tear-out
  lib/LeftPanel.svelte          Lightroom-style resizable panel
  lib/FileBrowser.svelte        single-level dir tree
  lib/Toc.svelte                document outline
  lib/Find.svelte               Ctrl+F search
  lib/Settings.svelte           settings panel
  lib/post-render.ts            heading id assignment + lazy KaTeX/Mermaid
  lib/tabs-store.svelte.ts      tabs state (open/close/reorder/persist)
  lib/settings-store.svelte.ts  persisted settings via tauri-plugin-store

docs/                           GitHub Pages landing site (static)
```

## Why exists

Research surfaced three convergent gaps:

1. **No good "double-click .md → instant render" app on Windows.** VS Code's
   preview hides behind folder-trust + multiple clicks. Notepad shows raw
   text. Obsidian forces a vault concept. Typora went paid. MarkText is
   abandoned. Boost Note shut down.
2. **The "AI-output viewer" niche is brand new and Mac-dominated.** Marky,
   MarkViewer, MacMD Viewer all launched 2025–2026 explicitly pitched at
   reviewing Claude/ChatGPT/Cursor output. None ship for Windows.
3. **Tauri 2 makes ~10 MB bundles realistic** for a true cross-platform
   reader without the Chromium tax.

## License

MIT
