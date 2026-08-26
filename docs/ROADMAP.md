# Fox MD — roadmap

What is next, in the order it is worth doing. `docs/DECISIONS.md` is the record
of what has already been settled; this is the open list.

Last reviewed **2026-08-26**, at v0.10.0-nightly.1.

---

## Now — v0.10.0, to finish before promoting

| # | Item | Why it is not done |
|---|---|---|
| 1 | **Use the annotation layer on a real document for a day** | Every claim about it was measured through the dev mock, in a browser. The mock does not exercise WebView2's selection behaviour, the real `.foxmd` folder on OneDrive, or a document long enough to stack a dozen threads. |
| 2 | **Export a real working document to .docx and open it in Word** | Verified against a synthetic fixture covering every construct. Not yet against a document with a table of contents, footnotes, an alert block and embedded screenshots all at once. |
| 3 | **Comment on a document while an agent is rewriting it** | The anchor-repair path is unit-verified by simulation. It has not yet met a real concurrent edit. |

## Next — desktop

| # | Item | Notes |
|---|---|---|
| 4 | **Read aloud** | See "Narration" below — this is the one with a real design decision in it. |
| 5 | **Notes panel in the sidebar** | A third section beside Files and Outline listing every note in the document, and every *detached* note. Detached notes are currently only visible if you happen to scroll past where they used to be. |
| 6 | **Comment on a heading = comment on a section** | Anchoring to a heading currently marks the heading text. Anchoring to the block *range* a heading owns is a small change and is what people mean. |
| 7 | **Reply to a comment from an agent** | The sidecar is already written to be agent-readable. Making it agent-*writable* is one documented convention — an agent appends a note with `"author": "Claude"` — plus the app noticing the file changed. Closes the loop the whole sidecar design was for. |
| 8 | **Export to PDF** | Page preview already computes exact page geometry. Print-to-PDF over the preview DOM is most of the work. |
| 9 | **Image embedding in .docx for remote images** | Currently skipped with a placeholder, deliberately (CSP). A Rust-side fetch behind an explicit opt-in would be the honest way. |
| 10 | **Nested folder tree** in the file browser | Still single-level. |
| 11 | **Breadcrumb `…` should be clickable** | A menu of elided ancestors. The context-menu primitive already exists. |
| 12 | **Multi-provider LLM** for the Theatre summary | Gemini's free tier, beyond Groq and Anthropic. |
| 13 | **Extend the file watcher to a set of files** | `watcher.rs` arms on exactly one file, the active tab. Refresh-on-focus is the escape hatch; watching the set is the real fix. |
| 14 | **Real-install visual smoke test on macOS** | Nobody has ever run a macOS build. Every Mac fix in the tree is reasoned, not observed. |

## Next — Fox MD for Android

The companion app. Full plan in **`docs/MOBILE-PLAN.md`**; the summary is that
the desktop's job is knowledge work and the phone's job is *continuing* it —
you get up from the laptop and the document you were reading is already there.

Sequenced so each stage is usable on its own:

- **M1 — Reader.** Open a `.md` from storage, register as the default handler
  for markdown, render it, pinch to zoom, drag to set line width. Portrait and
  landscape. This alone is worth having.
- **M2 — Annotations.** Highlights and comments, reading and writing the same
  `.foxmd` sidecar format the desktop uses, so a note made on either shows on
  the other the moment the folder syncs.
- **M3 — Handover.** Open tabs from every signed-in desktop, listed by device.
  Tap one and read it. This is the feature the app exists for.
- **M4 — Read aloud.** The phone is where narration actually gets used — walking,
  driving, away from the desk.

## Later — Fox MD on the web

Same reader, in a browser, at a URL. Drop a markdown file on it and read it, with
the same width and zoom controls. Deployed the way `wispr-fox-web` is (Vercel,
push to a branch, verify the preview, then merge — a push to `main` there is a
production deploy).

Deliberately after Android: the desktop app already covers "at my desk", and the
web version's real value only appears once accounts exist, which M3 builds.

---

## Narration — the decision that needs making

Asked for: read-aloud on the desktop *and* the phone, with modern-sounding
voices, for walking and driving. Three routes, and they are not exclusive.

### A. The webview's own `speechSynthesis` — ship this first

Zero dependencies, offline, free, and identical code on Windows and macOS.

- **Windows:** WebView2 exposes the system voices. Windows 11's *Natural* neural
  voices (Aria Natural, Guy Natural, and the rest) are a free download under
  Settings → Accessibility → Narrator → Add natural voices, and they are good.
  ⚠️ **Verify before promising it:** WebView2 has historically exposed only the
  older SAPI5 voices, not the Natural ones. Enumerate `getVoices()` on the
  target machine — that is a five-minute check and it decides whether route A is
  good enough on its own.
- **macOS:** WKWebView routes to `AVSpeechSynthesizer`, so the Siri-quality
  Premium/Enhanced voices are available once downloaded. This route is
  comfortably good enough on a MacBook.
- **What it buys beyond audio:** `boundary` events give word and sentence
  positions, which is what makes karaoke-style highlighting and "start reading
  from this paragraph" possible. Fox MD already knows where every block is, so
  auto-scroll-while-reading is nearly free.

### B. Native local TTS in Rust — the quality upgrade

`windows::Media::SpeechSynthesis` on Windows and `AVSpeechSynthesizer` on macOS,
reaching the neural voices directly rather than through whatever the webview
chose to expose. Still offline and free. Worth doing **only if the check in
route A shows WebView2 is stuck on SAPI5 voices**; it is otherwise the same
voices behind more code and a per-platform build.

### C. Pre-rendered audio — the right answer for driving

Streaming TTS in a car is fragile: it needs network, it stalls, and it cannot be
scrubbed. The right shape is a **file**: render the document once (locally with
Piper or Kokoro, or through a cloud voice for the best quality), hand the phone
an audio file with chapter marks at the headings, and let it play like a podcast
— lock-screen controls, Bluetooth, resume where you stopped.

This is also the only route that is genuinely pleasant for a long document, and
it is the one to build for M4 on Android.

**Recommendation:** A now on the desktop (behind the five-minute voice check),
C for the phone, B only if A's voices disappoint. Do not start with C on the
desktop — at a desk you want to skim and jump around, and a rendered file is the
wrong object for that.

---

## Standing rules for this repo

- **Every nightly updates `HANDOVER.md`, `CHANGELOG.md` and `docs/DECISIONS.md`
  in the same commit**, and this roadmap gets a pass for anything that has gone
  stale. A doc written a week later is a reconstruction.
- **Local gates before any push:** `npm run check` and `cargo check`. Never
  `npm run tauri build` — CI builds every platform on a tag.
- **Nightlies are published pre-releases, stable tags are drafts.** The in-app
  updater cannot see a draft.
- Collaboration model, git identity and machine setup: the workspace
  `CLAUDE.md` one level up is authoritative.
