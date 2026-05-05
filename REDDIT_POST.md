# Reddit launch post — drafts

Working drafts. The strategy: don't oversell. Lead with the *specific* problem
("watching Claude write into a long .md file is friction-y") and let the
solution speak. Acknowledge that other Markdown viewers exist. Show, don't
tell — every variant below should pair with a 10–15 second screen recording.

---

## Where to post (in this order)

| Subreddit | Members | Why | Post style |
|---|---|---|---|
| r/ClaudeAI | ~50k | Direct ICP. Claude Code users feel this pain daily. | Personal-story tone |
| r/Cursor | ~15k | Same workflow with Cursor's terminal/edit modes | Personal-story tone |
| r/sideproject | ~120k | Friendly, "show your thing" culture | Builder tone |
| r/rust | ~300k | Tauri/Rust angle. Credibility + potential contributors | Tech tone |
| r/tauri | ~3k | Tiny but engaged. Free PR. | Tech tone |

**Skip on day 1:** r/programming, r/software (downvote-heavy, "this exists" replies). Only post there if v0.1.x gets traction elsewhere.

**Best day/time:** Tuesday or Wednesday, 8–11 AM US Eastern. Avoid weekends.

---

## Draft 1 — r/ClaudeAI / r/Cursor (personal-story tone)

> **Title:** I was Alt-Tabbing 80 times a day to watch Claude Code write `plan.md` — so I built a Markdown reader that updates as the file does
>
> Whenever I run Claude Code on a long task, the first thing it does is write
> a plan.md or implementation-notes.md and keep updating it as it works.
>
> My old loop was: Claude streams text → I switch to VS Code → wait for the
> preview to repaint after I scroll → switch back to Claude → repeat. With
> the preview pane locked to a third of the screen and no auto-follow, it
> was the most annoying part of my day.
>
> So I built **md-reader** — a tiny (3.8 MB installer) Markdown viewer for
> Windows / macOS / Linux that:
>
> - Re-renders as the file changes on disk. Works on OneDrive paths too —
>   the watcher polls mtime as a fallback because notify's events on
>   reparse-point folders are unreliable.
> - "Live track" mode: turn it on and every section Claude rewrites stays
>   highlighted for ~6 seconds. Glance at the doc 4 seconds after a write
>   and you still see what just changed. There's a pulsing `📡 live` badge
>   in the toolbar so you know edits are streaming.
> - Multi-tab. Drop multiple `.md` files to open them as tabs. Drag a tab
>   outside the window to spawn a new window (Chrome-style).
> - Stateless. No vault, no setup. Double-click a `.md` from Explorer and
>   it opens. No folder-trust modal.
> - Adjustable column width (40–160ch slider, or full window) — fixes the
>   "preview pane is locked to 1/3 of my screen" thing.
> - GFM perfect: alerts, tables, footnotes, KaTeX, Mermaid, syntect-
>   highlighted code.
>
> 100% local, no telemetry, MIT licensed. Built on Tauri 2 + Rust + Svelte.
> Windows installer is ~3.8 MB; bundled binary ~7 MB. (For comparison: VS
> Code installer is ~95 MB, Obsidian ~120 MB.)
>
> **Download (v0.1.1):** https://github.com/kumaradarsh1993/md-reader/releases/latest
>
> **Source:** https://github.com/kumaradarsh1993/md-reader
>
> The video below is a 12-second recording of Claude Code writing a plan
> into a file with md-reader open next to it, live-track mode on. The
> sections light up as they're written.
>
> [embed video / GIF here]
>
> First public release, v0.1.1. Real bugs are real — would love issues filed
> if you hit anything. Especially curious about whether the live-track mode
> feels useful or distracting.

---

## Draft 2 — r/sideproject (builder tone)

> **Title:** md-reader — a 3.8 MB Markdown viewer that re-renders while your AI writes (Tauri 2, OSS, Win/Mac/Linux)
>
> A weekend-ish project that turned into something I actually use daily.
>
> **The problem.** AI tools (Claude Code, Cursor, ChatGPT desktop) often
> dump their output into Markdown files and keep updating them. None of the
> popular Markdown viewers handle that well: VS Code's preview is buried
> behind clicks and locked to 1/3 of the screen, Obsidian forces a vault,
> Typora went paid, MarkText is unmaintained, and the new "AI-output
> viewer" apps (Marky, MarkViewer) are all Mac-only and closed-source.
>
> **What I built.** md-reader — a viewer designed for *the moment your AI
> is still writing the file.*
>
> - File-watcher with a poll fallback (catches OneDrive/network drives that
>   notify-rs sometimes misses)
> - "Live track" mode keeps each AI-rewritten section accented for 6
>   seconds, so glancing back tells you what just happened
> - Multi-tab with drag-tab-to-new-window (Chrome-style)
> - Resizable side panel: file browser + document outline (Lightroom-style
>   collapsible stack)
> - Stateless — no vault, no setup. Double-click a `.md` and it opens.
>
> **Tech.** Tauri 2 + Rust + Svelte 5 + comrak. Release binary is ~7 MB,
> Windows installer is 3.8 MB. No Chromium tax.
>
> [video]
>
> v0.1.1. https://github.com/kumaradarsh1993/md-reader · MIT
>
> Open to PRs, ideas, and complaints.

---

## Draft 3 — r/rust / r/tauri (tech tone)

> **Title:** Built a 3.8 MB Markdown reader on Tauri 2 (Rust + Svelte 5) — one technical thing that surprised me
>
> Just shipped v0.1.1 of md-reader, a viewer-first Markdown app for the
> "I'm watching my AI write a long doc" workflow. Source:
> https://github.com/kumaradarsh1993/md-reader
>
> One technical thing worth flagging because it cost me an evening:
>
> **`notify` on Windows is unreliable on OneDrive paths.** The watcher uses
> `notify-debouncer-full` (which uses `ReadDirectoryChangesW` under the
> hood). On reparse-point folders — OneDrive, Dropbox, Google Drive Stream
> — events drop or arrive minutes late because those filesystems use
> "Files On-Demand" virtualization. `ReadDirectoryChangesW` doesn't see
> the local edit reliably; it sees a synthetic event when the cloud sync
> completes, sometimes much later.
>
> Fix that worked: a dual-strategy watcher. notify stays primary (instant
> on real disk). A poll thread checks `fs::metadata.modified()` every 1.2s
> as a fallback. Frontend dedupes by content, so duplicate events from
> notify+poll are harmless. ~30 lines of additional Rust:
>
> ```rust
> // src-tauri/src/watcher.rs (excerpt)
> let stop = Arc::new(AtomicBool::new(false));
> let stop_clone = stop.clone();
> std::thread::spawn(move || {
>   let mut last_mtime = fs::metadata(&path).and_then(|m| m.modified()).ok();
>   while !stop_clone.load(Ordering::SeqCst) {
>     thread::sleep(Duration::from_millis(1200));
>     if let Ok(meta) = fs::metadata(&path) {
>       let mtime = meta.modified().ok();
>       if mtime != last_mtime { last_mtime = mtime; emit("file-changed"); }
>     }
>   }
> });
> ```
>
> Other Tauri-2-specific things that bit me, in case anyone else hits
> them: drag-tab-to-new-window via `WebviewWindowBuilder` works fine, but
> `e.clientX/Y` lies on `dragend` when the drop is outside the window
> (Chromium quirk). Use `dataTransfer.dropEffect === "none"` instead.
> Also: `comrak`'s `header_ids` injects an empty `<a class="anchor">`
> inside each heading which somehow took horizontal width in WebView2 and
> visually centered the headings — disabling header_ids and assigning ids
> in the frontend post-render fixed it.
>
> Stack: Tauri 2 + comrak + syntect + notify-debouncer-full + Svelte 5
> + SvelteKit + KaTeX + Mermaid + CodeMirror 6 + tauri-plugin-store.
>
> Code's MIT, contributions/issues welcome.

---

## Anticipated objections + replies (use as comment-thread template)

| Objection | Reply |
|---|---|
| "VS Code preview already does this" | "VS Code preview hides behind folder-trust → right-click → open preview, locks to 1/3 of screen, doesn't auto-follow scroll on external file changes, and is ~95 MB. md-reader is 3.8 MB and built around the file-changing-while-you-watch case." |
| "Obsidian / Typora already do this" | "Obsidian needs a vault. Typora is paid + no live-follow on edits from external processes. Both are 100+ MB. md-reader is stateless: double-click the file." |
| "Marky exists" | "Marky is great! But Mac-only and closed-source. md-reader is Win/Mac/Linux + MIT." |
| "Why not a VS Code extension?" | "You'd be inside VS Code's preview pane sandbox — same constraints I'm trying to escape. Also I want to use this without VS Code running." |
| "Why Tauri and not Electron?" | "Electron's smallest installer is ~50 MB. Tauri 2 produces ~4 MB on Windows because it uses the OS's WebView2 instead of bundling Chromium." |
| "Couldn't you just use Glow or bat?" | "Both terminal-only. md-reader is the GUI for the workflow." |
| "How do I trust an unsigned exe?" | "You don't have to. Source is on GitHub, MIT, build it yourself: `git clone && npm install && npm run tauri build`. Code-signing is on the v0.2 list." |

---

## What to record for the demo video

Sequence (~15 seconds):
1. Open empty md-reader (1s)
2. `Ctrl+T`, pick a fresh empty `plan.md` (2s)
3. Cut to terminal: `claude "write a 5-section project plan into plan.md"`
4. Cut back to md-reader. Sections appear one-by-one. Live-track on, so each
   new section glows. The 📡 live badge pulses in the toolbar. (8s)
5. Drag a section heading via the outline — scrolls to it. (2s)
6. Cut: drag a tab outside the window → it spawns a new window with that
   doc. (2s)
7. End on the GitHub URL.

Tools:
- Windows: Xbox Game Bar (Win+G) or ShareX (free)
- Convert to GIF if posting somewhere that wants GIFs over MP4: ffmpeg or
  ezgif.com
- Keep under 6 MB if Reddit-uploading; otherwise host on YouTube unlisted
  and link.
