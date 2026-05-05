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
