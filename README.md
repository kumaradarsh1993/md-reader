<div align="center">

# md-reader

**A Markdown reader and editor built for the AI era.**
Re-renders as Claude, ChatGPT, or Cursor writes. Edit visually, without ever seeing `##` or `**`.

[![Download for Windows](https://img.shields.io/badge/Download-Windows-0078D6?logo=windows&logoColor=white&style=for-the-badge)](https://github.com/kumaradarsh1993/md-reader/releases/latest)
[![Download for macOS](https://img.shields.io/badge/Download-macOS-000000?logo=apple&logoColor=white&style=for-the-badge)](https://github.com/kumaradarsh1993/md-reader/releases/latest)
[![Download for Linux](https://img.shields.io/badge/Download-Linux-FCC624?logo=linux&logoColor=black&style=for-the-badge)](https://github.com/kumaradarsh1993/md-reader/releases/latest)

[Releases](https://github.com/kumaradarsh1993/md-reader/releases) · [Report a bug](https://github.com/kumaradarsh1993/md-reader/issues/new?template=bug.md) · [Request a feature](https://github.com/kumaradarsh1993/md-reader/issues/new?template=feature.md)

<!-- TODO: hero GIF (4-6s) — open a file, watch it stream, switch to smart edit, type a paragraph. Save as docs/img/hero.gif and uncomment below. -->
<!--
![md-reader hero](docs/img/hero.gif)
-->

</div>

---

## Why this exists

Every AI tool — Claude, ChatGPT, Gemini, Cursor — writes in Markdown by default. That's great, until you actually want to **read** the output without alt-tabbing into a code editor, or **edit** it without your non-technical teammates panicking at the `##` and `**` symbols.

`md-reader` does two things really well:

1. **Reading.** Open a `.md` file by double-clicking it. The app re-renders live while your AI is still writing. No vaults, no folders to set up, no "trust this workspace" prompts.
2. **Editing.** A WYSIWYG mode (called *Smart edit*) where markdown syntax is never visible. You type into the rendered view like it's a Notion or Word document. Bold, italics, headings, lists, tables, links — all there, none of the symbols. Saves clean markdown back to disk.

Local-only. No telemetry. No accounts. MIT licensed. ~10 MB installer (Tauri 2 — not a 200 MB Electron app).

## Quick start (60 seconds)

1. **Download** the installer for your OS from the badges above.
2. **Double-click** any `.md` file. md-reader opens with the file rendered.
3. **Press `Ctrl + E`** (`Cmd + E` on Mac) to switch to Smart edit. Type into the rendered view like a Word doc.
4. **`Ctrl + S`** to save back to disk. Reopen the file in any other editor — it's clean markdown.

That's the whole loop.

## What you can do with it

### 1. Read AI-generated markdown as it streams

Open a file in md-reader, kick off a Claude or ChatGPT task that writes to the same file. The viewer re-renders as the content arrives, with a brief highlight on the lines that just changed. Smart-scroll keeps you anchored — it only follows the edit if you're already near it, so you don't get yanked away mid-read.

<!-- TODO: screenshot — md-reader showing a rendered .md file with the "📡 live" badge visible -->

### 2. Edit visually, like a Word doc

Hit `Ctrl + E` and the file becomes editable in place. The markdown symbols disappear:

- **Headings** render at their proper size — no `#` prefix in sight
- **Bold / italic / strikethrough** show their actual styling, not the `**`/`*`/`~~` wrappers
- **Links** look like links, click the toolbar pencil to change the URL
- **Bullet and numbered lists** with proper indentation, hit Tab/Shift-Tab to nest
- **Tables** with right-click row/column controls
- **Code blocks** with syntax highlighting
- **Slash menu** — type `/` on a blank line to insert a heading, list, table, divider, etc.

On save, you get clean markdown back to disk. Round-trip safe — reopen the file in VS Code or any other editor and it's exactly the markdown you'd expect.

<!-- TODO: screenshot — Smart edit mode with the floating selection toolbar visible above a highlighted phrase -->

If you ever need the raw source, hit the **Raw** sub-toggle next to the Edit button. Power users keep their muscle memory; non-technical users never have to look at the syntax.

### 3. Multiple files, multiple windows

Drop a folder of `.md` files onto the window — each becomes a tab. Drag a tab outside the window to tear it off into its own native window. Tab order persists across restarts.

<!-- TODO: screenshot — tab bar with 3-4 tabs visible -->

### 4. Adjust how wide the content sits

`Ctrl + ]` and `Ctrl + [` widen and narrow the content column. `Ctrl + \` toggles full-window width. No locked narrow band like some other readers.

### 5. Side panel: file browser + outline

`Ctrl + B` toggles the file browser. The outline (`📑` button) shows your document's headings — click to jump. Both can resize by dragging the right edge.

<!-- TODO: screenshot — side panel open with file browser on top, outline below -->

## Keyboard shortcuts

`Ctrl` on Windows/Linux, `Cmd` on macOS. md-reader binds both, so muscle memory transfers either way.

| Shortcut | Action |
|---|---|
| `Ctrl + T` / `Ctrl + O` | Open file in new tab |
| `Ctrl + W` | Close active tab |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | Cycle tabs |
| `Ctrl + E` | Toggle View ↔ Smart edit |
| `Ctrl + S` | Save (edit mode) |
| `Ctrl + F` | Find in document |
| `Ctrl + ,` | Settings |
| `Ctrl + B` | Toggle files panel |
| `Ctrl + +` / `Ctrl + -` / `Ctrl + 0` | Zoom in / out / reset |
| `Ctrl + ]` / `Ctrl + [` | Wider / narrower content column |
| `Ctrl + \` | Toggle full-window content width |
| `Esc` | Close find / settings / file menu |

## Settings worth knowing about

`Ctrl + ,` to open. A few that matter:

- **Theme** — Auto (follows your system), Light, or Dark.
- **Default edit mode** — Smart (WYSIWYG) or Raw (markdown source). You can always flip per-tab via the toolbar.
- **Content width** — slider from 40 to 160 characters, or "Full window" for wide docs.
- **Smart-diff** (optional) — paste an Anthropic API key and md-reader can summarise what changed in a file since you opened it. Off by default; nothing is sent unless you enable it.
- **Experimental features** — for power users only. Live AI edit tracking (the 📡 toolbar button) and Diff mode (🔍) live here. Off by default to keep the toolbar calm.

## Give feedback

Pick the channel that fits:

- **Found a bug?** → [Open a bug report](https://github.com/kumaradarsh1993/md-reader/issues/new?template=bug.md). A short repro is gold.
- **Want a feature?** → [Open a feature request](https://github.com/kumaradarsh1993/md-reader/issues/new?template=feature.md). Tell me the workflow that's broken, not just the fix you want.
- **General "what should this become?" or "this idea is fuzzy"** → [Discussions](https://github.com/kumaradarsh1993/md-reader/discussions) (if enabled).

I read everything. PRs welcome.

<details>
<summary><strong>Build from source</strong> (devs only)</summary>

### Requirements

- **Node.js 20+**
- **Rust 1.78+** (via [rustup](https://rustup.rs))
- Platform C++ toolchain:
  - **Windows:** Microsoft C++ Build Tools + WebView2 (preinstalled on Win10/11)
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Linux:** `webkit2gtk-4.1`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`

### Commands

```bash
git clone https://github.com/kumaradarsh1993/md-reader
cd md-reader
npm install
npm run tauri dev      # dev mode with HMR + native window
npm run tauri build    # produces installer in src-tauri/target/release/bundle/
```

Frontend-only (no Rust required, useful for UI work):

```bash
npm run dev    # Vite dev server on :1430
npm run check  # svelte-check
```

### Stack

- **Backend:** Tauri 2 + Rust. Markdown rendering via [comrak](https://github.com/kivikakk/comrak) with syntect-highlighted code blocks. File watching via [notify](https://github.com/notify-rs/notify) with an mtime poll fallback for cloud-drive paths (OneDrive's reparse points break inotify).
- **Frontend:** SvelteKit (Svelte 5 runes) + Vite. Smart edit mode via [Milkdown](https://milkdown.dev) (a ProseMirror-based WYSIWYG that round-trips through remark AST — guaranteed clean markdown out). Raw edit via [CodeMirror 6](https://codemirror.net). Math via KaTeX, diagrams via Mermaid, both lazy-loaded.
- **Tabs:** Stored in `tauri-plugin-store` so they persist across restarts. Tear-out spawns a fresh `md-reader.exe` process per torn-out window (more reliable on Windows than in-process window-spawn).

### Project layout

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
  lib/SmartEditor.svelte        WYSIWYG editor (Milkdown / Crepe, lazy)
  lib/Editor.svelte             raw markdown editor (CodeMirror 6, lazy)
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
test-fixtures/                  round-trip fixture for smart-edit testing
```

See [CHANGELOG.md](CHANGELOG.md) for release notes.

</details>

## License

MIT — see [LICENSE](LICENSE) if present, or the `license` field in [package.json](package.json).
