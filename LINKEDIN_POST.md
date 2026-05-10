# LinkedIn launch post — drafts

Different vibe than Reddit. LinkedIn rewards *first-person, specific, slightly
vulnerable* posts more than catchy headlines. Lead with the why ("I noticed I
was alt-tabbing 80 times a day"), describe the artifact briefly, and end with
a question or invitation. No emojis-as-bullets, no "🚀 launching today!!" — that
underperforms on LinkedIn.

Keep it under ~250 words; LinkedIn truncates after ~3 lines on mobile, so the
**first 2 lines** matter most.

Use a **carousel image** (3-5 slides) if you can — those outperform plain text
posts 3-4x on LinkedIn. Slide content suggested at the bottom.

---

## Draft 1 — Personal-story tone (recommended)

> I was alt-tabbing 80 times a day to read what Claude was writing.
>
> Working with Claude Code on long tasks, the loop is the same every time:
> Claude streams a plan or implementation notes into a `.md` file, I switch to
> VS Code to read along, the preview is buried behind two clicks and locked
> to a third of the screen, no auto-follow, repeat.
>
> Two weekends ago I started building the thing I wanted: a Markdown reader
> designed for the moment your AI is still writing the file. Released v0.1
> last week, just shipped v0.1.2.
>
> What it does:
> — Re-renders as the file changes on disk. Watches via OS events with a poll
> fallback for OneDrive paths (where notify is unreliable).
> — A "diff" mode that highlights every section changed since you opened the
> file, so you can scan a long doc and see exactly what your AI added.
> — Multi-tab, drag-tab-out-to-new-window, lightroom-style resizable side
> panel, GFM-perfect rendering (alerts, math, mermaid, syntect-highlighted
> code).
> — 3.8 MB Windows installer. Built on Tauri 2 + Rust + Svelte 5.
> — Cross-platform (Windows, macOS, Linux). MIT licensed.
>
> A few non-obvious things I learned along the way:
> — `notify` on Windows is flaky on OneDrive folders because of reparse
> points / Files-On-Demand. The fix was a 1.2 s mtime poll alongside notify.
> — Tauri's `WebviewWindowBuilder` from inside a command handler can deadlock
> the main event loop on tear-out. Process-spawn (each torn-out window is a
> separate OS process) was much more robust.
>
> Repo: github.com/kumaradarsh1993/md-reader
>
> If you spend any meaningful time reading AI-generated Markdown — would
> genuinely love feedback on whether the workflow holds up for you.

---

## Draft 2 — Builder / launch tone (shorter, punchier)

> Spent the last two weeks building the thing I needed but couldn't find:
> a Markdown reader designed for files your AI is actively writing.
>
> Most viewers assume the file is static. AI-generated Markdown isn't —
> Claude, ChatGPT, Cursor edit it while you read. md-reader watches the
> file, re-renders as it changes, and (in the new diff mode) shows exactly
> what's been added since you opened it.
>
> 3.8 MB installer. Cross-platform. Open source. MIT.
>
> v0.1.2 just shipped: github.com/kumaradarsh1993/md-reader
>
> Honest take: the first three drag-tab-to-new-window fixes didn't work.
> Tauri's in-process window-spawn deadlocked the main event loop in a way I
> couldn't track down without DevTools-on-release. Switched to OS-process
> tear-out (each new window is a fresh `md-reader.exe`), which fixed it
> properly. Sometimes the lower-tech answer is the right one.
>
> Built with Tauri 2, Rust, Svelte 5, comrak. If anyone wants to dig in,
> repo's open and PRs welcome.

---

## Draft 3 — Technical-leadership tone (for Engineering Director audience)

> A pattern I keep seeing in our team: people are spending more time *reading*
> AI-generated text than writing prose themselves. Long Markdown files —
> plans, specs, retrospectives — that an LLM drafts and a human reviews
> live, then iterates on.
>
> The tooling for this hasn't caught up. Existing Markdown viewers (VS Code's
> preview, Obsidian, Typora) all assume static files: open once, read.
> They're not built for "the file is being rewritten while I'm reading it."
>
> So I built one. md-reader: a tiny (3.8 MB) Markdown viewer that watches
> the file, re-renders as it changes, and visually highlights every section
> changed since you opened it. Cross-platform, open source, MIT.
>
> v0.1.2 shipped today. github.com/kumaradarsh1993/md-reader
>
> Worth thinking about more broadly: AI-generated artifacts (code, prose,
> data) need new review tooling that takes "the artifact is still moving"
> as a first-class state. Static viewers and editors don't fit. That's the
> wedge.

---

## Suggested carousel slides (if you have time to make one)

5-slide carousel, 1080x1080:

1. **Hero**: dark background, large text "I was alt-tabbing 80 times a day to read what Claude was writing." Smaller "so I built a Markdown reader designed for it."
2. **The problem**: 3 quick visual examples — VS Code preview locked to 1/3 screen, Obsidian's vault setup screen, Typora's paywall. Caption: "Existing viewers don't handle 'the file is moving'."
3. **md-reader screenshot**: live-track mode active, a few sections accented, the 📡 live badge visible. Caption: "Re-renders while your AI writes. Highlights what changed."
4. **Diff mode screenshot**: same doc but with diff mode on, green border-left accents on changed sections. Caption: "See everything that's been edited since you opened it."
5. **CTA**: "Open source · MIT · 3.8 MB · Win/Mac/Linux. Link in comments."

Tools: Figma (free for one-off carousels), Canva, or just take screen recordings and grab frames.

---

## Posting strategy

- **Day**: Tuesday or Wednesday morning, 8–10 AM in your time zone.
- **First comment**: drop the GitHub link there (LinkedIn deboosts posts with external links in the body, but comments are fine).
- **Tag carefully**: only people who'd genuinely care. Mass-tagging tanks reach.
- **Hashtags**: 3 max. `#opensource #ai #developertools` works. Skip
  `#buildinpublic` — overused on LinkedIn, signals "promotional."
- **First-hour engagement matters most.** Reply to early comments fast — the
  algorithm rewards conversation density in the first 60 minutes.

---

## What NOT to write

- "Excited to announce..."
- "After months of hard work..."
- "This is going to revolutionize..."
- Any rocket emojis 🚀
- "Game-changer"
- "Disrupting"

LinkedIn audiences punish hype tropes harder than Reddit does. Plain
first-person voice and a specific anecdote outperform every time.

---

# v0.2.0 launch — drafts (Smart Edit Mode)

Headline change in this release: a WYSIWYG editor that hides every `##`,
`**`, and `[text](url)`. Markdown becomes approachable for non-technical
readers. Tertiary change: live-track + diff mode moved to Experimental
(off by default), so the toolbar is much calmer.

## Draft 1 — Personal-story tone (recommended)

> Markdown is suddenly everywhere — every AI tool writes in it. ChatGPT,
> Claude, Cursor, all default to `.md`. Which would be fine, except your
> manager opens the file in Notepad and asks why there are hashtags
> before every heading.
>
> So I spent two sleepless nights and burnt ~$100 in Claude API credits
> adding a **smart edit mode** to md-reader, my open-source markdown
> reader for Windows / macOS / Linux.
>
> You type into the rendered view — like Notion, like a Word doc. No `##`,
> no `**`, no `[text](url)` ever visible. Saves back to clean markdown on
> disk. Round-trip safe. If you want the raw source, one click flips you
> to it — power users keep their muscle memory; non-technical users
> finally stop asking what the asterisks mean.
>
> Also retired in this release: the "live AI edit tracking" chrome
> cluttering the top toolbar. Moved to Settings → Experimental, off by
> default. The product feels twice as calm.
>
> Stack: Tauri 2 + Svelte 5 + Milkdown for the WYSIWYG, comrak (Rust) for
> read-only. Local-only. No telemetry. MIT.
>
> v0.2.0 just shipped. Repo in the comments.
>
> (Tried to caffeinate through this. Couldn't — I'm one of those
> caffeine-oversensitive people, so it was a water-only two-nighter. The
> things one suffers for shipping software.)

## Draft 2 — Punchier / launch tone

> $100 in Claude API tokens. Two nights without sleep. Zero coffee
> (caffeine-oversensitive, don't @ me — water did the job). One feature
> I've wanted in a markdown tool for years.
>
> md-reader v0.2.0 ships **Smart Edit Mode**: type into the rendered
> view, no markdown symbols ever visible. Bold/italic/lists/links/tables
> all work the way they do in Notion or Word. Saves clean markdown to
> disk on every keystroke.
>
> Why this matters: AI tools have made markdown the default content
> format for everyone — not just developers. But the moment a
> non-technical reader hits edit mode and sees `## heading` and
> `**bold**`, they bounce. This closes that gap. Power users keep raw
> mode one click away.
>
> Open source, MIT, Tauri 2 + Svelte + Milkdown. Cross-platform.
>
> Repo in comments. Would love feedback from anyone who's tried to get
> a non-technical teammate to "just edit the markdown file please."

## What to tweak before posting

- Pick Draft 1 or Draft 2 (Draft 1 follows your v0.1 voice more closely).
- The `~$100` figure is approximate — sharpen if you want to cite the real
  Anthropic console number. Tokens-burned-to-ship-a-feature is a strong
  builder-credibility signal on LinkedIn right now.
- Add the GitHub URL in the **first comment**, not the body (LinkedIn
  deboosts posts with external links inline).
- Suggested screenshot/GIF: a 5-second clip of typing into a smart-edit
  surface with a list/heading auto-formatting, no markdown symbols ever
  flashing. Or a side-by-side of "what the AI wrote" (raw) vs "what the
  user sees" (smart edit).

## What to skip

- "Excited to announce v0.2…" — same trap as v0.1 launch.
- Naming the model used to generate the code (LinkedIn audience reads
  "wrote it with AI" → less interested in the artifact).
- Listing every minor change. Smart edit is the one thing worth leading
  with; everything else goes in the changelog.
