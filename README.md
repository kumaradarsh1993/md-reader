<div align="center">

# Fox MD

**A Markdown reader and editor built for the AI era.**
Re-renders as Claude, ChatGPT, or Cursor writes. Edit visually, without ever seeing `##` or `**`.

### [⬇ All releases — stable and nightly →](https://github.com/kumaradarsh1993/md-reader/releases)

**Current stable: v0.9.0**

[Website](https://kumaradarsh1993.github.io/md-reader/) · [Changelog](CHANGELOG.md) · [Report a bug](https://github.com/kumaradarsh1993/md-reader/issues/new?template=bug.md) · [Request a feature](https://github.com/kumaradarsh1993/md-reader/issues/new?template=feature.md)

<!-- TODO: hero GIF (4-6s) — open a file, watch it stream, switch to smart edit, type a paragraph. Save as docs/img/hero.gif and uncomment below. -->
<!--
![Fox MD hero](docs/img/hero.gif)
-->

</div>

---

## Why this exists

Every AI tool — Claude, ChatGPT, Gemini, Cursor — writes in Markdown by default. That's great, until you actually want to **read** the output without alt-tabbing into a code editor, or **edit** it without your non-technical teammates panicking at the `##` and `**` symbols.

Fox MD does two things really well:

1. **Reading.** Open a `.md` file by double-clicking it. The app re-renders live while your AI is still writing. No vaults, no folders to set up, no "trust this workspace" prompts.
2. **Editing.** A WYSIWYG mode (called *Smart edit*) where markdown syntax is never visible. You type into the rendered view like it's a Notion or Word document. Bold, italics, headings, lists, tables, links — all there, none of the symbols. Saves clean markdown back to disk.

Local-only. No telemetry. No accounts. MIT licensed. ~10 MB installer (Tauri 2 — not a 200 MB Electron app).

## Download

The **[releases page](https://github.com/kumaradarsh1993/md-reader/releases)** has everything, including
pre-release *nightly* builds. Direct links to the current stable build:

| Platform | Stable — v0.9.0 | Other formats |
|---|---|---|
| **Windows** | [Fox.MD_0.9.0_x64-setup.exe](https://github.com/kumaradarsh1993/md-reader/releases/download/v0.9.0/Fox.MD_0.9.0_x64-setup.exe) | [.msi](https://github.com/kumaradarsh1993/md-reader/releases/download/v0.9.0/Fox.MD_0.9.0_x64_en-US.msi) |
| **macOS** | [Fox.MD_0.9.0_universal.dmg](https://github.com/kumaradarsh1993/md-reader/releases/download/v0.9.0/Fox.MD_0.9.0_universal.dmg) | Intel + Apple silicon in one |
| **Linux** | [Fox.MD_0.9.0_amd64.AppImage](https://github.com/kumaradarsh1993/md-reader/releases/download/v0.9.0/Fox.MD_0.9.0_amd64.AppImage) | [.deb](https://github.com/kumaradarsh1993/md-reader/releases/download/v0.9.0/Fox.MD_0.9.0_amd64.deb) · [.rpm](https://github.com/kumaradarsh1993/md-reader/releases/download/v0.9.0/Fox.MD-0.9.0-1.x86_64.rpm) |

Installers upgrade an existing Fox MD in place — settings, tabs and reading positions carry over.
Windows SmartScreen will warn on first run (the build is unsigned): **More info → Run anyway**.

**Nightlies** are on the same [releases page](https://github.com/kumaradarsh1993/md-reader/releases),
marked *Pre-release*. They are built by CI from a tagged commit and carry whatever is being worked on
next — useful, occasionally rough.

## What's in it

| | |
|---|---|
| **Read** | Open any `.md` by double-clicking. Tabs, a file browser, an outline that follows where you are reading, find-in-page, three themes (light / sepia / dark), adjustable column width and zoom. |
| **Edit** | *Smart edit* is WYSIWYG — no `##` or `**` on screen — and saves clean markdown back to disk. A raw source editor is one toggle away. |
| **Never stale** | A refresh button (`Ctrl+R` / `F5`) re-reads the folder and every open tab, and the same sweep runs automatically whenever the window regains focus. Files edited by an agent while you were elsewhere are simply current when you look back. |
| **Resume** | Every tab keeps its own scroll position, and reopening a file returns you to it, with a "Last here" bookmark in the margin you can jump to or dismiss. |
| **Notes** | Select any text to highlight it, or leave a comment. Comments are threads — reply, edit, resolve — and live in a quiet margin that opens on a tap. Saved automatically, next to the document, in a format your AI assistant can read back. |
| **Export to Word** | `Ctrl+Shift+E` writes a real `.docx` in the house format. Rules, not a language model: the same file every time, and not one word rewritten. |
| **Page preview** | See the document as a Word-style page — US Letter, 1in margins, Calibri Light 11pt, line numbers — with a real page count and real page breaks. No conversion, no export. |
| **Live Edit Theatre** *(opt-in)* | When an AI is writing into the open file, highlight the block being edited and show a per-section diff. Off by default. |
| **Yours** | Local-only. No telemetry, no accounts, plain files. ~10 MB installer — Tauri 2, not Electron. MIT. |

## Quick start (60 seconds)

1. **Download** the installer for your OS from the badges above.
2. **Double-click** any `.md` file. Fox MD opens with the file rendered.
3. **Press `Ctrl + E`** (`Cmd + E` on Mac) to switch to Smart edit. Type into the rendered view like a Word doc.
4. **`Ctrl + S`** to save back to disk. Reopen the file in any other editor — it's clean markdown.

That's the whole loop.

## What you can do with it

### 1. Read AI-generated markdown as it streams

Open a file in Fox MD, kick off a Claude or ChatGPT task that writes to the same file. The viewer re-renders as the content arrives, with a brief highlight on the lines that just changed. Smart-scroll keeps you anchored — it only follows the edit if you're already near it, so you don't get yanked away mid-read.

<!-- TODO: screenshot — Fox MD showing a rendered .md file with the "📡 live" badge visible -->

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

The toolbar's width control is a miniature page: the lines of text inside it are
as wide as your real content column. Nudge it with `‹` / `›`, drag straight
across it, or scroll over it. `⤢` fills the window. `Ctrl + ]` / `Ctrl + [` /
`Ctrl + \` do the same from the keyboard. No locked narrow band like some other
readers.

### 5. Side panel: file browser + outline

`Ctrl + B` collapses and restores the whole panel. When it's collapsed, hover the
window's left edge and it slides out for as long as you need it — pin it to dock
it again. The `📁` and `📑` buttons choose which sections the panel shows.

The outline tracks your position: as you scroll, the heading you're reading stays
highlighted, so you always know where you are in a long document. Drag the divider
between Files and Outline to give either one more room, or the panel's right edge
to make the whole thing wider.

<!-- TODO: screenshot — side panel open with file browser on top, outline below -->

### 6. It remembers where you stopped reading

Every tab keeps its own scroll position, so switching between open files doesn't
scramble any of them. Close Fox MD, reopen the file, and you land where you
left off — with a quiet ribbon marking the spot, and a marker in the right gutter
to travel back to it if you've wandered. Turn either off in Settings → Reading
position.

## Keyboard shortcuts

`Ctrl` on Windows/Linux, `Cmd` on macOS. Fox MD binds both, so muscle memory transfers either way.

| Shortcut | Action |
|---|---|
| `Ctrl + T` / `Ctrl + O` | Open file in new tab |
| `Ctrl + W` | Close active tab |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | Cycle tabs |
| `Ctrl + E` | Toggle View ↔ Smart edit |
| `Ctrl + S` | Save (edit mode) |
| `Ctrl + F` | Find in document |
| `Ctrl + ,` | Settings |
| `Ctrl + B` | Collapse / restore the side panel |
| `Ctrl + +` / `Ctrl + -` / `Ctrl + 0` | Zoom in / out / reset |
| `Ctrl + ]` / `Ctrl + [` | Wider / narrower content column |
| `Ctrl + \` | Toggle full-window content width |
| `Ctrl + Shift + P` | Page preview |
| `Ctrl + Shift + E` | Export as Word (.docx) |
| `Ctrl + Shift + H` | Show / hide highlights |
| `Ctrl + Shift + M` | Show / hide the comment margin |
| `Ctrl + scroll` | Text size — also pinch on a trackpad |
| `Alt + scroll` | Characters per line |
| `Ctrl + Shift + D` | Diff sidebar (Live Edit Theatre) |
| `Esc` | Close find / settings / file menu / diff sidebar |

## Settings worth knowing about

`Ctrl + ,` to open. A few that matter:

- **Theme** — Auto (follows your system), Light, Sepia, or Dark. The toolbar has a one-click ☀ / ◐ / ☾ switch too.
- **Default edit mode** — Smart (WYSIWYG) or Raw (markdown source). You can always flip per-tab via the toolbar.
- **Content width** — slider from 40 to 160 characters, or "Full window" for wide docs.
- **Smart-diff** (optional) — paste an Anthropic or Groq API key and Fox MD can summarise what changed in a file since you opened it. Keys are kept in your OS credential store. Off by default; nothing is sent unless you enable it.
- **Reading position** — resume where you left off across sessions, and whether to mark the spot with a ribbon. Per-tab positions always persist while the app is open.
- **Advanced features** — 🎬 **Live Edit Theatre**: when an AI is writing to the file you have open, Fox MD recedes into a focused view, glows green on the block being written and fades it to yellow as it settles, and can show a per-section diff sidebar (`Ctrl + Shift + D`) with an optional LLM summary. Off by default.

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
  lib/Viewer.svelte             rendered output + live-follow + scroll memory
  lib/SmartEditor.svelte        WYSIWYG editor (Milkdown / Crepe, lazy)
  lib/Editor.svelte             raw markdown editor (CodeMirror 6, lazy)
  lib/TabBar.svelte             tabs with drag-tear-out
  lib/LeftPanel.svelte          collapsible resizable panel + hover-peek
  lib/FileBrowser.svelte        single-level dir tree
  lib/Toc.svelte                document outline with scroll-spy
  lib/WidthControl.svelte       visual content-width control
  lib/ResumeRibbon.svelte       "you left off here" marker
  lib/Find.svelte               Ctrl+F search
  lib/Settings.svelte           settings panel
  lib/outline.ts                heading parser (ATX + setext, fence-aware)
  lib/view-nav.svelte.ts        Viewer ↔ Outline bridge (source-line based)
  lib/post-render.ts            heading id assignment + lazy KaTeX/Mermaid
  lib/tabs-store.svelte.ts      tabs state (open/close/reorder/persist)
  lib/settings-store.svelte.ts  persisted settings via tauri-plugin-store
  lib/theatre/                  Live Edit Theatre (opt-in cinema view + diff)

docs/                           GitHub Pages landing site (static)
test-fixtures/                  round-trip fixture for smart-edit testing
```

See [CHANGELOG.md](CHANGELOG.md) for release notes.

</details>

## License

MIT — see [LICENSE](LICENSE) if present, or the `license` field in [package.json](package.json).
