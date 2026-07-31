# LinkedIn posts

## 2026-07-31 set — the two current drafts

Written for a business audience (marketing, finance, general management)
rather than engineers. The 2026-05 drafts further down are v0.2.0-era feature
announcements that never went out; they are kept only for the tone notes.

**Format decisions, from current data rather than habit:**

- **1,300–2,500 characters.** A 372k-post study (Sept 2025 – Feb 2026) puts
  peak engagement at 2,001–2,500 chars and peak impressions at 2,501–3,000.
  Both posts land in that band. The effect is real but modest — length is a
  nudge, not a lever.
- **The first ~140 characters are the whole ad.** That is the mobile fold.
  Each post opens with its single most surprising verified number.
- **No links in the body.** The measured reach penalty ranges from ~19% to
  ~60% depending on whose study you read, and LinkedIn has never confirmed it.
  The link-in-first-comment workaround is now substantially patched too. Both
  posts name their sources in plain prose and offer links on request, which
  turns the penalty into a reason to comment.
- **0–3 hashtags.** Q1 2026 data: more than three performed 71% worse than
  none at all. The upside of any is about 6%.
- **Deliver on the hook by line 4.** A hook that does not pay off gets read for
  three seconds and abandoned, and the algorithm now treats that abandonment as
  a negative signal — worse than a boring opening.

---

## Post 1 — the gap is the harness, not just the model

> **Sourcing note before posting.** The Karpathy post is real (@karpathy,
> 9 April 2026) but his argument is **symmetrical**: free-tier users underrate
> AI, *and* frontier power-users overrate how general it is — that is what he
> meant by capabilities being "peaky" and by "AI Psychosis". The draft below
> represents both halves on purpose. Quoting only the first half is the fastest
> way to get corrected in the comments by someone who actually read it.
>
> The 8.7% figure is Anthropic's own analysis of 1.2M Claude Cowork sessions,
> 11–31 May 2026. The "three times faster than developers" figure is from
> OpenAI's report *The Next Era of Knowledge Work* (June 2026).

Anthropic looked at 1.2 million sessions of its *coding* agent.

Software development was 8.7% of what people actually did with it.

The rest was business operations, writing, research, data analysis — the work
around the work.

There is a real gap opening up in what people believe AI can do, and it is not
mostly about intelligence. Andrej Karpathy put it well in April: a lot of us
formed our view by trying a free chatbot some time last year, and never
updated.

He was careful to cut both ways, and I will repeat that half too — the people
living inside these tools tend to overrate how general they are. The capability
is spiky. Genuinely remarkable at some things, unremarkable at others.

But the underrating half is the one quietly costing people time.

Because the gap is not only which model you get. It is the harness around it.

A chat window takes your question and returns text. An agentic harness — Claude
Code, or ChatGPT's Codex, both of which now run as ordinary desktop apps with
no terminal in sight — gets a folder. It reads every file in it. It writes
files back. It runs things, checks its own output, notices what it got wrong,
and keeps going for twenty minutes.

That difference is why the output is not close.

On Claude this is exactly the line between the free plan and the $20 one:
Claude Code and Cowork are not on the free tier at all. On ChatGPT, Codex comes
with Plus.

If you want to try it on real work, the on-ramp is duller than it sounds:

1. Install the desktop app. Open the Cowork (or Codex) tab.
2. Make a folder. Put the actual source documents in it — not a summary, the
   real files.
3. Treat it as one project. "Here are three years of AOP submissions and this
   year's draft. Reconcile them and write me the gaps."

Then read what comes back the way you would read a good analyst's first draft.
Correct it. Ask again.

OpenAI's own numbers say knowledge workers are adopting this roughly three
times faster than developers are.

What is the first piece of work you would hand it?

---

## Post 2 — markdown over PDF and Word

> **Sourcing note.** The 1,000-versus-7,000 figure is Anthropic's own, from its
> PDF support documentation: the same 3-page PDF via text extraction versus
> full PDF processing. The 1,500–3,000 tokens-per-page figure, and the fact
> that page images are billed *in addition* to the extracted text, are from the
> same page.
>
> The claim about the cost of *producing* a .docx is deliberately argued as a
> **mechanism**, not a number. No credible measurement exists — the 33% and 90%
> figures circulating online all trace back to markdown-converter vendors. Do
> not quote them.
>
> The caveat paragraph is load-bearing: a 9,649-experiment arXiv paper
> (2602.05447) found markdown the *worst* of four formats for database schemas.
> "Markdown is the most token-efficient format" is only true for prose.

Never run out of tokens again — the knowledge-work edition.

Anthropic's own documentation prices the same 3-page PDF two ways. Around 1,000
tokens if it reads the text. Around 7,000 if it processes it as a PDF.

Same document. Seven times the cost.

Here is why, and it surprised me: when you hand an AI a PDF, it does not only
read the words. It converts every page into an image and sends that too.
Anthropic's own figure is 1,500 to 3,000 tokens of text per page, plus a
picture of the page on top of that.

A page of plain markdown is a few hundred tokens. No page images. No layout
data, no fonts, no column positions.

The other half is worse, and almost nobody mentions it.

When you ask an agent to *produce* a Word file or a PDF, it cannot simply write
one. It writes a script to generate the file, runs it, hits an error, fixes it,
runs it again. And in these tools every retry re-sends the entire conversation
so far. Five attempts does not cost five times the script — it re-bills
everything you have done together, five times over.

Ask for a markdown file and it is one step. No build, no errors, no loop.

So the practical version: stop asking for the deliverable in Word. Work in
markdown throughout, and convert once at the very end, when a human actually
needs it in Word.

One honest caveat, because I keep seeing this oversold — markdown wins for
prose and documents. For large grids of data, CSV or YAML is leaner. Match the
format to the content.

What stopped me doing this for months was embarrassingly mundane: markdown
files are unpleasant to actually read. Notepad, or an editor built for
programmers.

So I built a reader for them. Word, but for markdown — real typography, an
outline you can navigate, remembers where you stopped reading, opens instantly,
barely touches your machine. I have used it daily for three months.

It is free and it is on GitHub. Happy to drop the link in the comments if it
would be useful.

What format are you asking your AI for right now?

---

## If someone pushes back

**"Anthropic's own Claude Code team said to use HTML, not markdown."** True —
Thariq Shihipar, May 2026, and it went wide. It is not a contradiction. His
argument is about the *final human-readable artifact*, and HTML is still a
plain-text single file with no build step, so it costs roughly what markdown
costs. The cliff is not markdown-versus-HTML. It is plain text versus binary
formats that need compiling.

**"Where is the DOCX number?"** There is not a trustworthy one. Say so. The PDF
figures are published by Anthropic and are enough to make the point.

**"7x seems too neat."** It is Anthropic's own like-for-like comparison of one
3-page document processed two ways, not an extrapolation. If pressed, fall back
to the component figures, which are also theirs: 1,500–3,000 text tokens per
page, plus a page image billed on top.

---

# Archive — 2026-05 drafts (v0.2.0 era, never posted)

Kept for the tone notes at the top, which still hold. The posts themselves are
stale: they pitch the smart-edit feature, and the product has moved on.


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
