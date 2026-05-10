# Demo & screenshot guide

Internal-only — instructions for recording the screenshots / GIF / video that the README and the LinkedIn carousel need. Don't ship this with the binary; it's just a checklist for you.

## What we need (priority order)

1. **Hero GIF** for the README (`docs/img/hero.gif`) — 4–6 seconds, autoplays, sets the tone.
2. **Five screenshots** for the README's "What you can do with it" section (`docs/img/*.png`).
3. **One 30–60 second screen-recorded video** for the LinkedIn post / Reddit thread (uploaded directly to those platforms — LinkedIn auto-plays muted videos in feed; Reddit accepts MP4 inline).
4. *(Optional)* A 5-slide carousel for LinkedIn — much higher reach than a plain post. Slide briefs are at the bottom of `LINKEDIN_POST.md`.

## Recording software (Windows)

Pick by what you're capturing:

| Tool | Best for | Cost | Why |
|---|---|---|---|
| **[ScreenToGif](https://www.screentogif.com/)** (Recommended for the README) | Short GIFs (≤30s) | Free | Tiny app, records → crops → optimises → exports a small GIF in one window. Perfect for the hero clip and the per-flow screenshots-in-motion. ~3 MB GIFs at 1080p. |
| **[OBS Studio](https://obsproject.com/)** | Long video demo (1–3 min) | Free | Industry standard. Records full screen or just the md-reader window. Use the "Window Capture" source so other notifications don't sneak in. Exports MP4. |
| **[ShareX](https://getsharex.com/)** | One-shot screenshots + quick clips | Free | Hotkey-driven captures. `Print Screen` → annotated PNG. Also does region-recording to MP4/GIF. |
| **Snipping Tool** (built into Win 11) | Still screenshots only | Free | Already on your machine. `Win + Shift + S` for region capture. Good enough for the README static screenshots. |
| **[CleanShot X](https://cleanshot.com/)** *(macOS later)* | Mac equivalent of all of the above | $29 (one-time) | Annotation, scrolling capture, GIF export. Used by basically every Mac indie. |

**My pick for your workflow:** ScreenToGif for everything visual in the README, OBS Studio for the LinkedIn/Reddit video. Both free, no signup.

### Optional but very useful

- **[Carnac the Magnificent](https://github.com/Code52/carnac)** — shows your keypresses as on-screen overlay. Crucial for a tutorial-style video so viewers can see "ah, they pressed Ctrl+E here."
- **[ZoomIt](https://learn.microsoft.com/en-us/sysinternals/downloads/zoomit)** — Sysinternals tool. Live zoom + annotation while recording. Great when you need to call out a specific button.

## Recording checklist (read once before you hit record)

- Set the OS theme to whatever matches your README's hero look (dark mode tends to look more "product-y" on social).
- Close every other app. Hide the taskbar (`Auto-hide taskbar` in Settings).
- Set md-reader's window to ~1280×800 — fits well in LinkedIn's 1.91:1 aspect ratio.
- Open one of the test files (the round-trip fixture in `test-fixtures/round-trip.md` is a good "real-looking" document).
- Make sure no personal paths show in the title bar — open a file from somewhere generic like `Documents/demo.md` if you can.
- Disable system notifications for 10 minutes (Win 11: Focus mode).

## Storyboard: the hero GIF (4–6 seconds)

Goal: in one breath, communicate "this reads markdown AND lets you edit it visually."

| Sec | Action |
|---|---|
| 0.0 | md-reader open with a clean rendered markdown file (a paragraph or two + a heading) |
| 1.0 | Press `Ctrl+E` — the surface shifts to the warm paper tint, no markdown symbols anywhere |
| 2.0 | Select a phrase — the floating selection toolbar appears |
| 2.5 | Click **B** — the phrase goes bold |
| 3.5 | Type `/` on a new line — slash menu appears |
| 4.5 | Click "Bullet list" — it inserts. Hold for a beat. |

Export at 15 fps (smaller file). Aim for under 4 MB so GitHub renders it inline.

## Storyboard: the LinkedIn / Reddit video (30–60 seconds)

Goal: a narrated walk-through showing the three things people will care about.

| Time | What you do | What you say (or text overlay if no voice) |
|---|---|---|
| 0:00 – 0:05 | Hero shot: app open, file rendered | "This is md-reader. Open any .md file by double-clicking." |
| 0:05 – 0:15 | Switch to another tab, kick off a Claude task in a separate window that writes to a `.md`, switch back to md-reader to show the file streaming in | "When Claude or ChatGPT writes to a file, md-reader re-renders it as it streams. No refresh, no setup." |
| 0:15 – 0:35 | Press Ctrl+E → smart edit. Select a phrase, bold it. Type `/` for slash menu, insert a list. Edit a paragraph. Press Ctrl+S | "Hit Ctrl+E and you can edit visually. No hashtags, no asterisks. It saves clean markdown back to disk." |
| 0:35 – 0:50 | Open another file as a new tab. Drag a tab outside the window — it tears off into its own window. Resize content width with Ctrl+] | "Multi-tab, drag tabs out to new windows, adjustable content width." |
| 0:50 – 0:60 | Cut to the GitHub releases page | "It's open source. Link in comments. Windows, Mac, Linux." |

Export as 1080p MP4. Mute the audio if you didn't narrate — LinkedIn autoplays muted videos in feed and adds captions if you upload them as a `.srt`.

## Storyboard: the five README screenshots

Same window size for all (≈1280×800), same theme, same demo file if possible — so the README feels visually consistent.

1. **`hero.gif`** (or `hero.png` fallback) — Smart-edit mode with the floating toolbar visible. The headline shot.
2. **`live-reload.png`** — Viewer with a file rendered + the small `📡 live` badge in the toolbar middle (you'll need to trigger a file change to make it appear briefly — easiest is to save the file from another editor).
3. **`smart-edit.png`** — Smart edit surface with the floating selection toolbar above a highlighted phrase. Show some headings, bold text, and a list in the doc.
4. **`tabs.png`** — Tab bar with 3–4 tabs open. One file with a long name to show the elision; one dirty (●) to show the unsaved indicator.
5. **`side-panel.png`** — Left panel open with the file browser on top, outline below. Show some nesting in the outline.

Save each as PNG under `docs/img/`. The README's `<!-- TODO -->` comments already point at the right paths — just uncomment the image markdown line below each comment once the file exists.

## Where to upload

- **README images** → commit them into `docs/img/` (the path the README points at). GitHub serves them inline.
- **LinkedIn video** → upload directly to LinkedIn. Don't link to YouTube; LinkedIn deboosts external video links.
- **Reddit video** → upload directly to Reddit (drag-and-drop into the post). Same reason — external links lose traction.
- **Carousel images** → upload as a PDF or as multiple images in a LinkedIn document post. (LinkedIn's native "document" attachment renders any PDF as a swipeable carousel.)

## After recording

1. Drop the files into `docs/img/`.
2. Uncomment the image markdown lines in `README.md` (search for `<!-- TODO: screenshot` — each has the ready-to-uncomment `![](docs/img/...)` line right below it; remove the `<!--` and `-->` lines around them).
3. Commit, push, tag `v0.2.0`, attach the installers to the Release.
4. Post on LinkedIn / Reddit pointing at the Release page.
