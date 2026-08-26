# Fox MD — the log

The record of *why* this product looks the way it does: what was asked for, the
reasoning behind the ask, what turned out to be hard, what was decided and what
was deliberately not built.

`CHANGELOG.md` says what shipped. This says why, and what it cost. Newest first,
same as the changelog, so the two can be read side by side.

**Keep this current.** Add an entry in the same session as the work — an entry
written a week later is a reconstruction, and reconstructions lose exactly the
part worth keeping: the wrong turn.

---

## v0.10.0 — 2026-08-26 — annotation, export, and the mechanics of reading

### What was asked for

A long brief, in the owner's words, covering six things:

1. Promote what exists to stable.
2. The page preview shows "a lot of line segmenters" — in the house format, a
   line runs under *the* section title, not under every heading, and certainly
   not after every paragraph.
3. A **rule-based** markdown → Word converter, so producing a .docx stops
   requiring a model.
4. **Highlights and comments** as a layer over the document: show/hide each,
   threads rather than flat notes, a lined-out marker in the right margin that
   expands on click and stays expanded, add/edit/delete, and intelligent sizing
   because "a lot of times these comments would be pretty long". Aesthetics
   explicitly called out. Auto-save, including on OneDrive. Readable by an AI:
   *"you created a markdown file for me… I figured out I need to leave feedback…
   those comments should be readable by you"*.
5. Smooth scrolling — "a little bit of jitteriness in current scrolling… smooth
   scrolling is standard across all products these days".
6. Ctrl+scroll to zoom, Alt+scroll to change line width, and a content width
   that stops being capped on a 27" external monitor.

### What was actually wrong, in each case

**The scrolling was not a polish problem.** `blocksAbove()` — the probe that
decides which outline entry is lit and where the reading position is — walked
the document's blocks calling `getBoundingClientRect()` on each one until it
passed the probe point, and it ran **twice per scroll frame**, plus more rects
in the resume marker. Every one of those is a forced synchronous layout. Near
the bottom of a long document that is thousands of layout flushes per frame.
No amount of CSS would have fixed it.

The fix: `.viewer` is already `position: relative`, so it is every block's
`offsetParent` and `offsetTop` is a *content-space* coordinate — independent of
scroll. Measure once per layout change, invalidate with a `ResizeObserver`, and
every scroll frame becomes a binary search over cached numbers.

> **Generalises:** when something "feels janky", look for a read of layout inside
> the scroll handler before looking at the animation. `getBoundingClientRect` in
> a loop in an `onscroll` is the single commonest cause, and it is invisible in
> code review because each individual call is obviously cheap.

**The width cap was a constant pretending to be a limit.** `WIDTH_MAX = 160`.
Unreachable on a laptop, which is why it survived four versions; on a 27" panel
at 70% window width it is a wall with an inch of blank paper past it. Replacing
it with a bigger constant is the same wall moved, so the ceiling is now measured:
a hidden `20ch` probe in the document's own font gives px-per-character, the
pane gives available width, and the ratio is the ceiling. 160 is kept as the
*floor* so a small window is never worse off than before.

**The page preview's rules.** The rule was on `h1` *and* `h2`. Every document an
agent writes is a stack of `##` sections, so every one came out striped — that
is the "line segmenters" complaint, and the second half of it was `---`, which
markdown-writing models put between every section and which was being drawn as a
literal horizontal rule. Both fixed: rule on level 1 only, `---` becomes a
paragraph of air.

### Decisions worth keeping

**The .docx exporter walks the rendered HTML, not the markdown.** The app already
has a correct, extension-complete markdown parser — comrak, in Rust, with tables,
task lists, footnotes, alerts and smart punctuation. A second parser in
TypeScript would mean two parsers that disagree, and the one document where they
disagreed would preview correctly and export wrong. So the export re-renders
through the same Rust path and walks the DOM.

**No library for the .docx.** A `.docx` is a ZIP of a dozen small XML parts.
JSZip or `docx` would add a few hundred KB to a reader whose selling point is
being light, to use about 5% of it. The ZIP is written with the *stored* method,
which removes any need for DEFLATE; the only real algorithm is CRC-32. The cost
is file size (a 40-page document is ~200KB rather than ~40KB), which for
something emailed once is the right trade.

**Verification was Word itself.** Not a schema validator and not eyeballing the
XML: the generated file was opened through the Word COM automation interface and
interrogated. That is what caught the things a validator would have passed —
`Heading 1` carrying a bottom border while `Heading 2` does not, `start="3"`
producing "3." and "4.", a following ordered list restarting at "1." instead of
continuing (the classic Word numbering bug), real `List Paragraph` bullets rather
than typed characters, Calibri Light 11pt throughout, 612pt page width with 72pt
margins.

**Annotations anchor to rendered text, not to source offsets.** The selection is
made in the rendered view and the highlight has to be painted there; the markdown
for a passage is full of characters that are not in it (`**`, `[](…)`, table
pipes). Mapping a DOM selection back through comrak's output to a source byte
range means writing that second inexact parser again. So the anchor is
`(block line, offset, length)` plus the quoted text with 48 characters of context
either side — W3C Web Annotation's TextPosition + TextQuote pairing, for the same
reason it exists there. The first pair is the fast path; the second is what
survives an agent editing the file above your comment.

**Highlights paint with the CSS Custom Highlight API, not `<mark>` wrapping.**
Wrapping is the obvious approach and it is wrong *here specifically*: two other
features already split this DOM's text nodes (the Find bar wraps every match,
`postRender` injects into code blocks). A third text-splitting painter has to
interleave with both, and the failure mode — fragments left behind when one
clears while another holds split nodes — is silent and cumulative.
`CSS.highlights` touches nothing. The price is hit-testing, since a
`::highlight()` pseudo-element receives no clicks; that is recovered with
`caretRangeFromPoint` in a plain click handler.

**The comment lane is reserved, not overlaid.** The brief wanted threads that are
not permanently open *and* never overlap anything. Those pull opposite ways if
the lane is an overlay: a collapsed marker needs 26px, an open card needs ~300,
and an overlay that grows on click has to land over the text. So when a document
has comments the viewer's padding shrinks by a fixed strip. Opening a card costs
no reflow, because the space was already there.

**Cards have no fixed height and no inner scrollbar.** "A lot of times these
comments would be pretty long" is the whole reason. A three-paragraph note in a
120px box with its own scrollbar is unreadable *and* hides that there is more.
The card grows; the stack below it moves down. Measured: a three-paragraph note
grew its composer to 199px and its card to 460px, with four threads on screen and
zero overlaps.

**Enter is a newline; Ctrl+Enter posts.** Chat apps do the opposite. These are
prose notes, and losing a half-written paragraph to a stray Enter is not
acceptable in a box whose entire purpose is holding a paragraph.

**Notes live in `.foxmd/` beside the document, in two files.** Not inside the
markdown — a highlight is the reader's state, not the document's content, and
writing HTML comments into a file an agent is concurrently rewriting is a merge
conflict waiting to happen. Not in the app's settings store either, because the
requirement was that *an agent reading the document can read the feedback on it*,
which means travelling and syncing with the file. `<name>.notes.json` is
authoritative; `<name>.notes.md` is generated from it on every save and is what
gets read. Strictly one direction, so there is no sync problem — if the markdown
were lost or hand-edited, the next save regenerates it.

**Deleting the last note demotes to a highlight rather than removing the mark.**
The passage was flagged for a reason; deleting a sentence you wrote about it is
not the same as deciding it no longer matters.

**A detached annotation is kept, not dropped.** When the quoted passage is no
longer anywhere in the document the note is shown as detached. Deleting someone's
feedback because the sentence it was about was rewritten is exactly backwards —
that is the moment the feedback matters most.

### Gate opened: the UI can now be looked at

This repo had **no way to see a UI change short of building an installer**.
`cargo test` cannot launch its harness on this machine (the test binary links the
WebView2 stack — `STATUS_ENTRYPOINT_NOT_FOUND`), and a Tauri window cannot be
driven or screenshotted by agent tooling. `src/lib/devmock.ts` installs
`window.__TAURI_INTERNALS__` when `?devmock=1` is in the URL, so the real
frontend runs in an ordinary browser against a fake backend. It is tree-shaken
out of production by an `import.meta.env.DEV` guard.

Everything claimed about the annotation layer above was measured through it.
Fox Mark reached the same conclusion independently in August; treat "mock the
Tauri boundary" as the house answer for verifying a Tauri UI.

### Not built, deliberately

- **Cross-block selections.** A comment on "the end of one paragraph and the
  start of the next" has no stable meaning once either is edited, and supporting
  it means every resolution path handles a range that may now be discontiguous.
- **Fetching remote images during export.** The app runs a strict CSP with no
  external `connect-src`; widening it so an export can reach the network opens
  that door for every rendered document. A remote image becomes its alt text.
- **Rendering markdown inside comment bodies.** Nobody writes a table in a margin
  note, and it would mean a second render path with its own escaping questions.

---

## v0.9.0 — 2026-08-25/26 — Page preview and self-update

**Asked for:** know how long a document will be as a Word file, and where the
pages break, without converting it. Plus: stop having to download installers by
hand.

**Decided:**

- **A preview, not a converter.** Nothing written, no .docx produced. (v0.10
  added the converter; the preview stayed, because "how long is it" is a
  different question from "give me the file".)
- **Pagination measures real line boxes.** The content is laid out once,
  off-screen, at exactly the text-column width, and `Range.getClientRects()`
  gives one rect per visual line — which is why wrapped paragraphs, tables and
  headings are all countable without assuming a line height. Breaks land on the
  last line boundary that fits, so a line is never sliced.
- **`MIN_TAIL` exists for a real bug**: `scrollHeight` rounds up to a whole pixel
  while the last line's bottom is fractional, so an exact end-comparison left a
  1.5px sliver and reported one page too many. A 3-page document reported 4.
- **One type size, 11pt, headings included.** The first cut had a 16/13/12pt
  heading ladder — a Word default, and the single thing that stopped the preview
  looking like the document it was previewing.
- **The updater is not `tauri-plugin-updater`.** That plugin wants a signed
  manifest and a keypair in CI secrets. This app ships unsigned builds from a
  public repo, so the signing apparatus buys nothing and costs a key-management
  story. `updates.rs` reads the public releases API directly.
- **The fetch is in Rust, not the webview**, because opening `connect-src` to
  reach api.github.com widens what *every rendered document* can talk to.
- **Nightlies became published pre-releases rather than drafts.** Load-bearing,
  not a preference: GitHub's API hides draft releases from unauthenticated
  callers, so while nightlies were drafts the app could not see them.
- **Version comparison is honest about what it cannot know.** A nightly and a
  stable of the same line report the same `CARGO_PKG_VERSION`, so the UI says
  "newer" or "same version" and never claims "you have this exact build".

**Trap recorded:** `line-height: 1` on a box with `overflow: hidden` has nowhere
to put a descender, so every p/y/g/j is sliced at the stem. It was in the context
menus and latent in both crumb trails.

---

## v0.8.0 — 2026-08-25 — reading comfort

**Asked for:** a file an agent changed should not be shown stale; the outline
should track where you are *reading*; three-column tables should not scroll
sideways.

**Decided:**

- **Refresh from disk is one code path** behind six surfaces (button, `Ctrl+R`,
  `F5`, File menu, two context menus) plus an automatic silent sweep on
  `window.focus` — the changes come from a terminal, so the moment you look back
  at Fox MD is the moment it is most likely stale.
- **`Ctrl+R` and `F5` are `preventDefault`ed.** In a webview those mean "reload
  the page", which here discards the whole session's tab state to achieve
  strictly less than refresh does.
- **Dirty tabs are skipped unconditionally.** A refresh that could discard
  unsaved edits is a worse bug than the staleness it fixes.
- **The outline tracks a *reading line*, not the top border** — the middle of the
  viewport, ramping to the true top in the first half-screen and the true bottom
  in the last. Ramps, not snaps: a hard rule would jump a section on a one-pixel
  scroll. This also fixed something that had been impossible: the last section of
  a document could never be highlighted, because a final section shorter than the
  viewport can never reach the top border.
- **`width: max-content` was the whole table bug.** It asks for the width the
  table would take with no line breaking anywhere — right for a table of file
  paths, wrong for a table of sentences. `min-width: 7ch` on cells is what keeps
  the horizontal scroller meaningful when a table genuinely is too wide.
- **Surface tone tracks distance from the document.** Paper is the extreme of the
  range; every surface further out steps back toward mid-grey. One rule, read in
  two directions — in dark mode "further out" is also darker, because there the
  paper is the lightest thing on screen.

---

## v0.7.0 — 2026-08-01 — "it still looks developer-y"

**Asked for, verbatim:** *"95% there, but it still looks developer-y — I want it
to look general-consumer-y."* Three specifics: the side panel looks too similar
to the text, the tab bar mixes with the text, and the toolbar shows a raw
`D:\...\file.md`.

**The diagnosis is the part worth keeping** — two of the three were not matters
of taste and were not fixable with "more contrast":

- `--side-bg` and `--bg` were **literally the same colour in dark mode**. The
  panel *was* the document surface.
- The tab strip drew from `--muted-bg`, a token shared with in-document table
  headers, which in dark mode made it the brightest surface in the window.

**Decided:** a two-material model. `--chrome-bg` for everything that is not the
document; the document is a sheet floating on it. Light mode's tonal gap was
*reduced* (6.7% → 3.5%) and warmed — separation comes from the edge, not the
tone. **Keep chrome tokens and document tokens separate**; merging them is what
caused this.

**Also:** the emoji were replaced with real icons. Emoji were the loudest "hobby
build" signal in the product — every platform draws them at a different weight
and none can inherit `currentColor`, so a "muted" toolbar button rendered as a
full-saturation yellow folder.

**Security baseline closed:** CSP was `null` and is now strict; the `fs` plugin
and its unscoped read/write grants were removed entirely (the frontend never
imported it); comrak's GFM `tagfilter` was switched on, because this app renders
raw HTML from *arbitrary files on disk* — CSP-null plus `unsafe_` plus fs-write
was a genuine exfiltration chain, not a theoretical one. API keys moved to the
OS keyring, keyring-first with a file fallback only on real failure.

**Traps recorded:**

- **`onMount` ordering in `+page.svelte` is load-bearing.** Local wiring
  (keyboard, context menu, drag-drop) must register *before* the first `await`.
  It used to sit after a chain of Tauri calls, so one rejection silently removed
  every keyboard shortcut in the app.
- **`post-render.ts`'s table wrapper must copy `data-sourcepos`.** A wrapper
  without it drops every table out of scroll-restore, live-follow, diff mode and
  Theatre highlighting at once.
- **The slug algorithm lives in two files and they must stay byte-identical**
  (`post-render.ts` assigns ids, `outline.ts` predicts them). Both now match
  GitHub's, so hand-written tables of contents finally resolve — the old `h-`
  prefix meant none of them ever did.

---

## v0.6.0 — reading position, outline, and the side panel

**Asked for, paraphrased:** *"if one file is scrolled to the bottom and I switch
to another tab, that one has scrolled too — bad experience."*

**The cause:** the Viewer is a single long-lived instance shared by every tab and
restored whatever `scrollTop` it last saw. It now keys off a `tabId`, flushes the
outgoing tab's position before reading the incoming one, and explicitly starts
unvisited documents at the top.

**Decided:**

- **Two coordinates per remembered position**, because neither survives
  everything: a source line (survives font-size, width and zoom changes, and
  edits *below* the position) and a scroll ratio (the fallback when that block is
  gone). The same reasoning later produced the annotation anchor.
- **Per-tab retention is unconditional** — that is correct behaviour, not a
  feature to toggle. The setting governs only whether it survives quitting.
- **Writes are coalesced on a 600ms trailing timer and force-flushed** on
  `beforeunload` / `pagehide` / visibility-hidden, so quitting right after
  scrolling does not lose the position. (v0.10's note autosave is the same
  machinery, for the same reason.)
- **The outline is source-line based, not slug based.** comrak's `data-sourcepos`
  gives exact line ranges; slug matching breaks on duplicate heading text.
- **`Ctrl+B` was rebound** from "toggle Files" to "collapse the whole panel" —
  the near-universal binding (VS Code, Obsidian, ChatGPT) was being spent on the
  less useful of the two.
- **The width control shows a page, not a number.** The old `86ch` badge told you
  a number without telling you what it did.

**Measured, and worth remembering:** `ch` is the advance width of the digit zero,
about 15% wider than the average lowercase glyph — so "86 characters" delivered
about 95. The default moved to 76ch, which lands inside the 45–75 band typography
has agreed on for continuous reading.

---

## Before v0.6 — the short version

| Version | What it was for |
|---|---|
| v0.5.1 | Sepia reading theme; three-way theme switch in the toolbar |
| v0.5.0 | Live Edit Theatre v2 — recede-not-shrink, fresh vs stale highlights, leader lines, Groq as the default provider (free tier, no card) |
| v0.4.0 | Live Edit Theatre and the diff sidebar: watching an AI edit the file you are reading, without losing your place |
| v0.3.0 | Toolbar cleanup, About dialog, tab tear-out z-order fix |
| v0.2.0 | Smart edit mode, user-first README, the CI workflow that still builds every release |

Two decisions from that era still constrain the product:

- **Theatre turn history is in-memory only, by design.** The file on disk is the
  source of truth; no sidecar files. Note this is *unlike* reading positions and
  annotations, which are deliberately persisted — a reading position and a
  comment are the user's own state, not a derived artefact of the document.
- **Theatre triggers on any external edit**, not just an AI's. The writer is not
  fingerprinted. Documented behaviour, not a bug.
