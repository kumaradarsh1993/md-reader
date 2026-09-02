# Changelog

## 0.12.0-nightly.1 - 2026-09-02

### Added - Changes: what was touched since you last read it

You are working across five documents with an agent. It edits two of them and
creates a sixth. Nothing anywhere tells you which. That is what this fixes.

Fox MD now keeps a record of every file you have read that is later edited by
something other than Fox MD - an agent, another editor, a sync - and tells you
what changed and when.

- **A count on the toolbar clock.** The number of changes you have not looked
  at yet, visible without opening anything.
- **The Changes panel** lists them newest first, grouped by when the work
  happened. This is the "I stepped away, what did it do?" view, and it covers
  files you do not have open.
- **A dot on the tab** and **a dot in the file browser** for anything with
  something unread in it.
- **A line in the margin** beside each changed passage, spanning exactly the
  paragraphs that moved. The text itself is never recoloured.
- **Click the line** and a panel rises showing the passage before above and
  now below, with the changed words marked. Where a passage was edited more
  than once, step back through the iterations with the arrows.
- **On the start page**, so a file that changed while you were away is the
  first thing you see when you open the app.

**Times are told at the resolution that suits them.** Edits minutes apart are
one session, and within it you see the gaps - `+2 min`. A session gets a
heading naming the day and the hours: `Today, 8:04-10:12 pm`, `Sunday, 8-10 pm`,
`Sun 8 Mar, 8-10 pm`. The timestamps are the file's own, so two hours of work
discovered in one moment still reads as two hours of work.

**It only forgets when you tell it to.** Nothing decays on a timer. A change
stays marked until you open it, or mark the file read - and scrolling past is
not reading. The record lives in `.foxmd/` beside your documents, so it
survives restarts, closing the tab, and travels with the folder.

Fox MD can only compare against a version it has seen, so a file becomes
tracked the first time you open it.

### Changed - Live Edit Theatre and Changes are separate features

The theatre animates an edit while you watch it and remembers nothing
afterwards; Changes is the record you consult later. They share no settings and
either can be on without the other. The theatre stays off by default; Changes is
on, because a history is no use if you had to predict you would want it.

## 0.11.0-nightly.3 - 2026-09-02

### Fixed - tabs can be reordered again

Drag a tab left or right and the strip makes room for it, the way a browser
does. Neighbours slide out of the way as you cross them, the tab lands where you
put it, and Escape mid-drag puts it back.

This had been broken rather than missing. Fox MD asks Windows and macOS to
deliver files dropped onto its window - that is how dropping a `.md` on it opens
the file - and while that is switched on, the webview stops delivering
drag-and-drop events to the page. Tearing a tab out into its own window kept
working, because that detects a drop landing *nowhere*; reordering needed the
events that were being intercepted, so it silently did nothing.

- **Drag a tab out of the strip** - up or down, past about a finger's width -
  and it opens in its own window. A prompt tells you before you let go.
- **`Ctrl`+`Shift`+`PgUp` / `PgDn`** moves the current tab, for when you would
  rather not drag. Also in the tab's right-click menu.
- The strip scrolls when you hold a tab against either edge, so you can move a
  tab somewhere that is currently off-screen.

### Fixed - opening a file from Finder on macOS did nothing

Double-clicking a markdown file in Finder brought up a Fox MD window and then
left it empty, however many times you tried. Quitting and relaunching could not
help, because nothing was ever being asked to open the file.

Every other platform passes the file to the app as a command-line argument;
macOS does not, and sends a message instead. Fox MD was only listening for the
argument. It now listens for both.

This also explains the folder-permission prompt that only appeared later, once
you had opened the app first and browsed to the file: macOS asks for access to
OneDrive at the moment an app first *reads* something there, and Fox MD was
never getting as far as reading.

### Changed - a start page instead of a blank window

The screen with no file open was a large Command symbol above the words "No file
open" - a Mac keyboard glyph, shown on every platform, restating what was
already obvious, in the middle of the biggest empty space in the app.

It is now somewhere to start from: what to open, and the files you had open
recently, with the folder each one lives in.

## 0.11.0-nightly.1 - 2026-08-28

### Added - Handover

Sign in with Google (Settings -> Handover) and Fox MD publishes the documents
you have open. Sign in on your phone with the same account and they are waiting
there - tap one and carry on at the line you stopped at.

- **One account across your machines and your phone**, and shared with
  wispr-fox, so it is the same Google sign-in you already use.
- **Your data is yours.** Every row is scoped to your account by the database
  itself; two people signing in see entirely separate sets of devices.
- **Publishing is automatic** - 2.5 seconds after anything changes - and
  closing a tab removes it, so the phone shows what is open *now*.
- **You can stay signed in without publishing.** The toggle is separate,
  because signing in on one machine should not silently start broadcasting from
  every machine.
- **Name each machine** ("Home Alienware") so the phone's list reads like your
  desk rather than like a list of hostnames.
- Documents over 256 KB are listed but not carried over the network.

**It is built not to sign you out.** Tokens refresh before they expire rather
than after; concurrent refreshes are serialised, because the token rotation
that protects your session is also the classic cause of mystery logouts; and a
timeout or a hotel wifi portal leaves your session alone to retry instead of
treating it as a logout.

Your sign-in never touches the page that renders your documents. Fox MD opens
arbitrary markdown with raw HTML enabled, so a session reachable from the page
would be a session reachable from a document someone sent you.

## 0.10.0-nightly.3 - 2026-08-26

### Fixed - highlighting and commenting were the same thing, and should not have been

Three related complaints, one cause: the first version treated a comment as "a
highlight that has something to say", so the two shared one record and one
colour.

- **Commenting no longer paints a highlighter colour.** A commented passage now
  gets a rule under the text - the mark a document editor uses for "there is
  something written about this" - instead of a colour you never chose. If you
  want it highlighted as well, pick a colour; it is optional and it always was
  meant to be.
- **There is a "No highlight" option**, in the colour row of the selection bar
  where every editor puts it. It clears the fill on everything the selection
  touches.
- **You do not have to select a highlight exactly to remove it.** Select the
  whole paragraph - or just right-click inside the highlight without selecting
  anything at all - and choose **Remove highlight**. Overlap is enough.
- **Clearing a highlight never deletes a comment.** A mark that carries a
  conversation keeps the conversation and only loses its colour. Only a bare
  highlight, with nothing said about it, disappears.
- The right-click menu inside a document now also offers **Highlight**, **Add
  comment** and **Open comment** when they apply.
- Re-highlighting the same words in a different colour recolours the existing
  mark instead of stacking a second one on top of it.

## 0.10.0-nightly.2 - 2026-08-26

### Fixed

- **A latent way for the whole app to stop responding.** The code that re-finds
  a highlight after the document has changed wrote its result back from inside
  the same reactive pass that read it. In Svelte that is an effect feeding its
  own input: it reports one line to the console and then abandons the component,
  after which every button in the app silently does nothing. In practice it
  settled after two passes, but "usually settles" is not a defence when the
  failure is the app going dead. Repairs are now applied outside the pass.
  Verified against a deliberately corrupted anchor: repaired correctly, quote
  intact, highlight still painted, and the interface still responding.

## 0.10.0-nightly.1 - 2026-08-26

### Added - highlights and comments

- **Select any text** and a small bar appears: five highlight colours, and
  **Comment**. A highlight is one click; a comment opens a card in the right
  margin with the cursor already in it.
- **Comments are threads.** Reply to a note, reply to a reply, edit any note,
  delete one (its replies go with it), or mark the whole thread resolved.
- **The margin does not shout.** A thread you are not reading is a small pill
  carrying its reply count, at the height of the text it belongs to. Click it
  and it opens in place and stays open; click again and it closes. Cards scroll
  with the page because they are positioned in the document's own coordinates,
  not tracked by a scroll handler.
- **Nothing overlaps and nothing is covered.** When a document has comments the
  reading column gives up a fixed strip on the right, so opening a card costs no
  reflow and never lands on the text. Several notes near the same paragraph
  stack downward in reading order.
- **The box fits what you wrote.** No fixed height and no inner scrollbar: a one
  line note is one line, and three paragraphs of feedback are three paragraphs.
  Enter is a newline, Ctrl+Enter posts - losing a half-written paragraph to a
  stray Enter is not acceptable in a box whose purpose is holding a paragraph.
- **Both layers toggle independently** - `Ctrl/Cmd+Shift+H` for highlights,
  `Ctrl/Cmd+Shift+M` for the comment margin - and each toolbar button shows a
  count, so hiding one is visibly hiding something rather than losing it.
- **Notes save themselves**, 600ms after you stop typing, and again the moment
  you switch tabs or quit. A failed write is retried rather than dropped.

### Added - your notes are readable by your assistant

Notes live in a `.foxmd` folder beside the document, so they travel with it and
sync with it (OneDrive included):

- `<document>.notes.json` is authoritative - exact anchors, ids, timestamps.
- `<document>.notes.md` is generated from it every time you change anything, and
  is what a person or an AI actually reads: each passage quoted, with the thread
  underneath it in order.
- A `.foxmd/README.md` explains the pair, so finding the folder is enough.

An assistant asked to act on your feedback can now read the file it wrote and
the notes you left on it, without you re-typing either.

### Added - export to Word

- **File -> Export as Word (.docx)**, also on the Page preview bar, also
  `Ctrl/Cmd+Shift+E`. Rules, not a language model: the same input always
  produces the same document, and no prose is rewritten on the way through.
- Headings, lists (nested, numbered, bulleted, task lists), tables with
  repeating headers, code blocks, block quotes, links, bold/italic/strikethrough
  and inline code all come through. Local images are embedded.
- The output is the format Page preview has been showing all along: Letter,
  1in margins, Calibri Light 11pt throughout, a rule under level-1 headings.
- Numbered lists behave: a list that starts at 5 starts at 5, and the next
  numbered list starts again at 1 instead of continuing the previous one.

### Changed - scrolling

- **Scrolling is smooth now.** It was doing thousands of forced layout
  calculations per frame - the outline probe walked the document element by
  element on every scroll event, twice - which is what the jitter was. Positions
  are measured once when the layout changes and every scroll frame is now
  arithmetic.

### Changed - width and zoom

- **The content-width ceiling follows your monitor.** It was a fixed 160
  characters, which no laptop can reach and a 27in display hits with an inch of
  empty paper still on either side. It is now measured from the window you are
  actually reading in.
- **Ctrl+scroll resizes the text. Alt+scroll changes the line width.** In Page
  preview, Ctrl+scroll scales the page as it does in Word. A trackpad pinch
  works too.

### Changed - Page preview

- **The full-width rule is under level-1 headings only.** It was under h1 and
  h2, so any document that is a stack of `##` sections came out striped.
- **`---` is a break, not a printed line.** Markdown written by an agent puts
  one between every section; drawing each as a rule left the page with more
  horizontal lines than headings.

### Added - for developers

- `?devmock=1` in a dev build stands in for the Tauri backend so the interface
  can be opened and driven in an ordinary browser. Stripped from release builds.

## 0.9.0 — 2026-08-26 — stable

Promoted unchanged from `v0.9.0-nightly.2`. The v0.9 line is about **seeing the
document as it will actually land** and **keeping the app itself current**:

- **Page preview** — the open document laid out as a real Word page: US Letter,
  Normal margins, 11pt throughout, true page breaks on line boundaries, and a
  real page count. A preview, not a converter.
- **In-app updates** — Settings → Updates reads GitHub live, tells you what is
  running versus what is out, and installs it for you on Windows.
- **The resume bookmark** rebuilt as a single dismissible mark in the margin
  that never crosses the text.
- **Settings as a right-hand drawer**, and **file-list sorting** by name or by
  most recently changed.


## 0.9.0-nightly.2 — 2026-08-25

### Added — update from inside the app

- **Settings → Updates** shows the running build, the latest stable and the
  latest nightly, each with how long ago it was built and how big the download
  is, a **Check again** button, links to both release pages, and **Install**.
- **Install does the whole thing**: downloads the installer and, on Windows,
  runs it silently and reopens Fox MD. Settings, tabs and reading positions
  carry over. On macOS and Linux the file is downloaded and opened, because a
  `.dmg` has to be mounted and an AppImage has nothing to install.
- Nothing is hard-coded — the releases are read live from GitHub each time you
  open Settings or press Check again.
- **Nightly builds are now published as pre-releases instead of drafts.** This
  is what makes the whole feature work: GitHub does not show *draft* releases to
  an unauthenticated caller, so while nightlies were drafts the app could not
  see that a newer build existed.
- The network call lives in Rust, not the webview. The app runs a strict CSP,
  and opening `connect-src` to reach GitHub would have widened what every
  rendered page can talk to.

### Changed — Page preview now matches the house format

All of this came from reading the first version against a real document.

- **One type size for the whole page: 11pt.** Headings included — they are bold
  and ruled, never bigger. The 16pt/13pt/12pt heading ladder was a Word default
  and it was the single thing that stopped this looking like the document it is
  previewing. Tables are 11pt too now, rather than a point smaller.
- **No indentation anywhere.** Lists sit flush with the body text, markers and
  all; the 24pt list indent was spending a third of an inch of a 6.5in column to
  say "this is a list", which the marker already says. Nesting gets one small
  step instead of a tab stop.
- **Block quotes lose their bar and their indent** and read as ordinary
  paragraphs — in a Word document, that is what they are.

## 0.9.0-nightly.1 — 2026-08-25

### Added — Page preview

- **A new toolbar button (and `Ctrl/⌘+Shift+P`) lays the open document out as a
  Word-style page**: US Letter, Word's "Normal" 1in margins, 11pt Calibri Light,
  Word's default paragraph spacing, and continuous line numbers down the left
  margin. It reports a **real page count** with **real page breaks** — breaks
  land on line boundaries, so a line is never sliced across two pages.
- It is a *preview*, not a converter: nothing is written to disk and no .docx is
  produced. The point is answering "how long is this, and where do the pages
  fall?" before exporting, instead of converting the file to find out.
- Zoom 50–150%, page count / line count / word count in the bar, `Esc` to leave.
- Headings carry a rule across the full text column. That is what Word does with
  a heading's *paragraph bottom border* — which is why the line runs the width of
  the column instead of stopping where the words do, as a character underline
  would.

### Changed — the resume bookmark is one dismissible mark in the margin

The old "you left off here" ribbon is gone. It drew a rule **across the text**
with its tag on the left, while a second pill sat in the right gutter — so the
half you could see was never the half you could dismiss, and getting rid of it
meant scrolling the rule back into view to find its ✕.

- **One mark, always in the right margin**, never over the text. It tracks the
  remembered line while that line is on screen, and pins to the nearer edge with
  a ▲/▼ when it isn't — which is also what tells you which way to scroll back.
- **Click it to jump; ✕ to remove.** One thing to dismiss, always reachable.
- **It retires itself** once you have read a full screen past it.
- It says "Last here", not "You left off here" — the app remembers the block
  that was at the top of your viewport, not the sentence you stopped on, and the
  label should not claim more than that.

### Changed — Settings is a drawer

- Settings now opens as a **full-height panel on the right** at up to 560px wide,
  instead of a 460px card floating in the middle of a maximised window. The
  document stays visible beside it, and the five sections get their length back.
  The header sticks, so the way out is reachable from anywhere in the list.

### Added — sort the file list

- **Name (A→Z) or Recent (most recently changed first)**, toggled from the Files
  panel header or its right-click menu, and remembered. Folders stay first in
  both orders. In Recent, each row shows a short relative timestamp — the thing
  being sorted on — and in Name order it stays out of the way.

### Fixed

- **Descenders were being sliced off in the right-click menus** — the p, y, g and
  j in "Copy folder path" lost their stems. A label with `overflow: hidden` for
  its ellipsis had a line box exactly as tall as the font, leaving nowhere to put
  a descender. Fixed there, and in the two crumb trails with the same shape of
  bug.
- **The toolbar shows one folder, not the whole path.** `… › a › b › file.md` is
  now `folder › file.md`; the full path is still in the hover tooltip and the
  right-click menu.
- **Tab tooltips are drawn by the app**, not by Windows. The native tooltip was a
  black box with white text pasted onto a cream page, and it could not wrap a
  long path sensibly. Now it shows the file name and its folder, in the app's own
  theme.

## 0.8.0 — 2026-08-25 (Stable)

Promoted from `v0.8.0-nightly.2` with no further changes — the two nightlies
below are the whole of this release. Refresh from disk, an outline that tracks
the reading line, wrapping tables, a hover-only side-panel scrollbar, layered
window surfaces, and a sectioned Settings.

## 0.8.0-nightly.2 — 2026-08-25

Reading-comfort pass. Everything here came from one round of feedback on
nightly.1, and all of it is about the app getting out of the way.

### Changed — tables wrap instead of scrolling sideways

- **A table now fits the page and wraps its cells.** It used to be laid out at
  `width: max-content` — the width it would need if no line ever broke — so a
  three-column table with two columns of ~20-word sentences claimed a couple of
  thousand pixels and pushed you into a horizontal scroll, for content that
  wraps comfortably into the column. Columns are now sized in proportion to
  their content: a two-word "Decision" column stays narrow and the prose
  columns take the space.
- **Genuinely wide tables still scroll.** Cells hold a 7-character floor, so a
  twelve-column grid overflows and the wrapper scrolls rather than squeezing
  every column into slivers. Long unbreakable strings (file paths, URLs) still
  break inside their cell instead of blowing the layout out.
- This is a rendering choice, not a limit of the markdown: GFM table syntax
  carries no width or wrapping information at all, so how a table lays out is
  entirely up to the reader. Nothing in your files needs to change.

### Changed — the side panel's scrollbar is hover-only

- The outline and file list keep their scrollbar hidden until the pointer is
  over the panel; the document's own scrollbar is unchanged, because in a long
  read that one carries real information. Only the *thumb* is hidden, never the
  track's width, so the list can't reflow as the pointer crosses it.
- The same applies to the diff sidebar.

### Changed — the window reads as layers

- **New setting: Appearance → Window surfaces (Layered / Flat).** Layered — the
  new default — steps the title bar, toolbar and side panel apart by tone, each
  one a shade further from the page; the rule is that tone tracks distance from
  the document, so it works the same way in light, sepia and dark. Flat is the
  previous v0.7 look, where the chrome is one colour separated by edges alone.
  On Windows the native title bar follows, via the same DWM call that already
  themed it.
- **Settings is now sectioned** — Appearance, Side panel, Reading, Editing,
  Advanced — instead of one undifferentiated column where a theme picker and an
  LLM API key carried identical visual weight. The Smart-diff provider and key
  fields moved inside Advanced and appear only when Live Edit Theatre is
  enabled, since that is the only feature they affect.

### Changed — smaller things

- **The refresh icon turns clockwise**, arrowhead at the top right, matching
  every browser's reload button. The mirrored form read as "undo".
- **The file list marks the folder your open file is inside**, so stepping up a
  level still answers "which of these did I come out of?". A quieter mark than
  the open file's own, and it never confuses `docs` with `docs-old`.
- **File list typography** now shares the outline's type ramp — 12px, folders
  carrying the weight and files receding — instead of sitting a size larger
  than everything around it. Same typeface as the rest of the app; scale was
  what made it read as a different thing.

## 0.8.0-nightly.1 — 2026-08-25

Two reader complaints, both about the app quietly showing you something that
isn't true: content that had changed on disk, and an outline that claimed you
were somewhere you weren't.

### Added — Refresh

- **A refresh button, next to File** (also <kbd>Ctrl/⌘+R</kbd>, <kbd>F5</kbd>,
  File → Refresh from disk, and the right-click menus). It re-reads the folder
  listing *and* every open tab from disk in one go. Tabs with unsaved edits are
  skipped — a refresh must never be able to discard something you typed — and a
  tab whose file has since moved or been deleted is left open rather than
  vanishing. The button's tooltip reports what the last run actually did, since
  "nothing had changed" and "the button is broken" otherwise look identical.
- **The same sweep runs automatically whenever a window regains focus.**
  That is the moment the app is most likely to be stale: you were away in a
  terminal or an editor, which is where the change came from. It is silent — no
  spinner, no flicker — and coalesced so alt-tabbing twice doesn't run it twice.

  *Why this was needed:* the file watcher arms itself on exactly one file — the
  active tab — so a background tab could sit on hours-old content, a new file
  appearing in the open folder was never noticed at all (the listing is read
  once, when you enter the directory), and on OneDrive/Dropbox/network paths
  the OS change notifications are documented as unreliable in the first place.
  Refresh is the escape hatch for everything the watcher structurally cannot
  see. Windows are separate processes, so each refreshes itself.

### Changed — the outline follows where you're reading, not the top border

- **The active-section mark now tracks the middle of the screen**, ramping to
  the true top edge within the first half-screen of scrolling and to the true
  bottom within the last. Practical effect: the first section is highlighted
  when you open a document, the section you are actually looking at is
  highlighted through the middle of it, and **scrolling to the bottom finally
  moves the mark to the last section** — which it never did before, because
  with three sections on screen only the one touching the top border ever lit
  up, and a short final section could not reach that border at all.
  The ramps (rather than a snap at each end) mean the highlight never jumps a
  section for a one-pixel scroll.
- **The progress rail is measured from the same reading line**, so how far the
  bar has filled and which entry is lit can no longer disagree. It still reads
  empty at the top and exactly full at the bottom.
- Resume-where-you-left-off is deliberately unchanged: it still records the
  block at the *top* of the viewport, because that is where restoring puts it
  back.

## 0.7.0 — 2026-08-01 (Stable)

The "stop looking like a developer tool" release. v0.6 was, in the owner's
words, 95% there — but it read as something built for the person who built it.
This pass is mostly about the other 5%: what the app appears to be made of,
where its boundaries are, and what happens when you right-click.

It also fixes a set of renderer defects found by a source audit, several of
which had been silently wrong since v0.1.

### Changed — Fox MD identity

- **The app is now Fox MD.** Window titles, installer identity, About,
  documentation, release presentation and the landing page all use the new
  name. The technical bundle identifier, executable name and MSI upgrade code
  stay stable so an existing md-reader install upgrades in place instead of
  appearing as a second app. The NSIS installer also detects and removes the
  old per-user `md-reader` entry in updater mode before installing Fox MD,
  preserving application data while preventing duplicate Add/Remove entries.
- **New warm paper-and-tail icon.** A parchment page wrapped by an abstract
  cinnamon ribbon gives the app a fox-family cue without using a literal fox
  or overlapping the bright character mark of Whisper Fox and the angular
  mascot of FoxCull. Native PNG, ICO, ICNS and Windows tile assets were all
  regenerated from the same 1024px source. The previous turquoise/yellow mark
  remains in `assets/legacy-md-reader-icon.png` as the backup source.

### Changed — chrome and content are now different materials

The complaint behind most of this release was that the side panel "looks too
similar to the text I'm reading" and the tab bar "mixes too much with the
text". Both were true, and the cause was measurable rather than a matter of
taste:

- **In dark mode the side panel and the document were the same colour.**
  `--side-bg` and `--bg` were both `#1c1c1e` — byte-identical. There was no
  surface boundary to see, only a hairline.
- **The tab strip was painted from a token shared with the document** (table
  headers, `<kbd>`). In dark mode that made the tab strip the *brightest*
  surface in the window — brighter than the page being read.

The fix is not a louder border. The application shell is now its own material
(`--chrome-bg`), and the document is a **sheet resting on top of it**: one
rounded corner where it meets the panel and the tab strip, a hairline ring, and
a whisper of shadow. In dark mode the sheet is *lighter* than the shell, which
is the convention every modern dark interface converged on.

Counter-intuitively the light-mode tonal gap got **smaller** (6.7% → ~3.5%),
not bigger. The field separates chrome from content with an edge, not with
tone; a large tonal step is what reads as "IDE". The palette also moved warm —
blue now sits a few points below red in every surface token.

- **The glass toolbar is gone.** It carried `backdrop-filter: blur(20px)` over
  an opaque fill, as a flex sibling of the content — so there was never
  anything behind it to blur. It cost a compositor layer and a stacking context
  (which the File menu had to be teleported out of) for zero pixels of effect.
- **Tabs are rounded chips** on the shell, with the active one filled in the
  *paper* colour so it reads as a hole punched through to the document. The 1px
  dividers between tabs and the 2px accent stripe on the active one — the
  strongest "developer tool" tells in the window — are gone.
- **The tab strip now belongs to the document column** rather than spanning the
  whole window above the side panel, so the panel is full height and every tab
  sits directly above the page it opens.
- **Emoji are no longer used as icons.** The folder, outline, gear, magnifier
  and theme glyphs are a real inlined icon set now. Emoji cannot inherit
  `currentColor`, so a "muted" toolbar button was rendering a full-saturation
  yellow folder.
- **Section headers are sentence case** ("Files", "Outline") instead of 10.5px
  uppercase micro-labels, and each section's dismiss control appears on
  approach rather than sitting there permanently.
- The side-panel toggle is now the leftmost control in the toolbar, ahead of
  the File menu — it governs window layout, and layout controls belong at the
  outside edge.
- Find and Settings are larger, and Settings is a sliders glyph rather than a
  cog that read as a circle at 17px.

### Added — the document's location, as a breadcrumb

The toolbar used to print the raw path. That is a string a developer reads and
everyone else skips: the one part that matters is buried at the end. It is now
a breadcrumb — muted ancestors, chevron separators, weighted file name, elided
from the *left*, because the drive letter never carries meaning.

### Added — Focus mode

`F11` (⌃⌘F on macOS, where F11 belongs to Mission Control) hides the toolbar,
the tab strip and the side panel, and takes the window fullscreen. `Esc` or the
same key leaves. Pushing the pointer to the very top edge slides the toolbar
back down for as long as you need it — the difference between a focus mode and
a trap — and a one-shot toast on entry says how to get out.

### Added — real right-click menus

Right-clicking anywhere used to produce the WebView's own page menu: Back,
Reload, **Save as**, Print, Inspect. Every entry was either meaningless in a
document reader or actively wrong. That menu is suppressed app-wide now and
replaced with contextual ones:

| Where | What you get |
|---|---|
| A tab | Close / close others / close to the right, open in new window, copy name or path, reveal in Explorer |
| The tab strip | Open file, close all |
| The document | Copy selection, find selection, open or copy a link, copy a link to the section, back to top, reload from disk |
| A file row | Open, open in new window, copy name or path, reveal |
| The file list | Up, refresh, copy folder path, reveal |
| An outline entry | Jump, copy heading text, copy link to section |
| The breadcrumb | Copy file name / full path / folder path, reveal |

Text fields keep the native menu on purpose — it is the only place "Paste"
lives.

### Fixed — renderer defects

- **YAML front matter rendered as a giant `<h2>`.** With no front-matter
  delimiter configured, comrak parsed the closing `---` as a *setext underline*
  for the metadata above it. Every document with front matter opened with a
  heading reading "title: … author: …", which also became the first entry in
  the outline.
- **Every in-document anchor link was dead.** Heading ids carried an `h-`
  prefix, so a hand-written table of contents — standard in long AI-written
  documents — linked to `#vertical-rhythm` while the id was
  `h-vertical-rhythm`. Nothing ever resolved. Slugs now match GitHub's
  algorithm and are Unicode-aware, so `## Résumé` and `## 概要` no longer
  collapse to the same empty slug.
- **External links navigated the entire app away.** There was no click handler
  on the rendered document at all. One misclick in a README replaced the app
  with a web page, in a window with no address bar, no Back button and no
  reload — recoverable only by closing the window. Links now open in the real
  browser, relative `.md` links open as a tab, and `#anchors` scroll.
- **Wide tables were clipped and unreachable.** `overflow-x: auto` does nothing
  on `display: table`, and the viewport clips. Tables are wrapped in a real
  scroller now (which inherits `data-sourcepos`, so scroll-restore, live-follow
  and diff highlighting still see them).
- **GFM column alignment was silently discarded.** `:---:` and `---:` produce
  `align=` attributes, which a blanket `text-align: left` beat every time.
- **Long inline code and URLs overflowed the column and were clipped**, with no
  way to scroll to them. A 62-character Windows path is ~80% of the text
  column.
- **Sepia used the light syntax-highlighting theme**, calibrated for white, on
  a cream background. It has its own now.
- **Task list items sat on a different left edge than plain bullets** in mixed
  lists.
- **Badge rows stacked vertically** — the `p > img` rule never matched the
  standard `[![alt](badge)](link)` shape, because the image's parent is the
  link, not the paragraph.
- **`<div align="center">` half-worked**: a `!important` text-align kept the
  heading hard-left while everything around it centred.
- Settings failing to load no longer aborts the rest of startup — which
  previously took the entire keyboard with it.

### Changed — typography

- **Vertical rhythm.** There was not one adjacent-sibling rule in the prose
  stylesheet; every gap was decided in isolation and resolved by margin
  collapsing. An `h2` followed by its own first `h3` opened a 33px gulf, lists
  did not group with the sentence introducing them, and consecutive list items
  sat 3px apart while the lines *inside* an item sat 26px apart.
- **The type scale stopped flatlining.** h5 was exactly body size with weight
  600 and a strong colour — character-for-character how `**bold**` is styled,
  so `##### Heading` and a bold lead-in were pixel-identical. h4 now outweighs
  `strong`, and h5/h6 differ by shape (small caps) rather than by size.
- **Default measure 86ch → 76ch**, and the column's gutter is no longer
  subtracted from it. The old setting delivered ~95 characters of type and
  drifted as the window resized.
- **Tables** use horizontal rules instead of a full grid plus zebra striping.
  The zebra was a 1.6% step in light mode (invisible), and in sepia the header
  fill and the zebra fill were *the same value*, so the header vanished into
  the body.
- **Blockquotes are full-contrast.** In these documents blockquotes carry the
  highest-stakes content; muting them inverted the author's emphasis, and
  failed WCAG AA in sepia at 3.5:1.
- **Links are underlined.** Colour alone was the only cue, at ~1.8:1 against
  body text in sepia.
- **GFM alert colours** were GitHub's *dark* tokens used in all three themes —
  all five failed contrast in light and sepia.
- Code blocks get a language label and a copy button.
- `<details>` / `<summary>` are styled rather than falling back to UA defaults.
- Definition lists, superscript, subscript and relaxed task markers (`[-]`,
  `[~]`) are enabled — two of them had matching CSS sitting dead in the
  stylesheet since v0.1.
- Added a print stylesheet.

### Added — the title bar follows the theme

The one strip of the window the app doesn't draw was being coloured by the OS,
so a dark Windows with the app in sepia produced a black bar above a cream
page. Windows now gets exact caption, text and border colours via DWM; macOS
gets a matching light/dark appearance. Sepia counts as light.

### Fixed — macOS and Linux

Every user-visible shortcut label was hardcoded to "Ctrl" and now renders ⌘ on
macOS. The traffic-light gutter was deliberately *not* added: the window keeps
a native title bar, so the lights sit above the toolbar and reserving space for
them would open an empty hole. Focus mode uses ⌃⌘F there rather than F11, which
belongs to Mission Control.

Four further cross-platform defects, three of them introduced by this release's
own changes and caught in review:

- **Reading position was lost by rubber-band scrolling.** macOS reports a
  *negative* `scrollTop` when you overscroll past the top. That negative ratio
  was persisted and then floored to zero on the way back in — so letting go of
  the trackpad at the top of a document silently reset "resume where you left
  off" to the very beginning. The ratio is clamped at capture now, not only at
  restore. Windows never showed this: WebView2 has no elastic overscroll.
- **Standalone images would not have centred on Linux.** The new rule relied on
  `:has()`, and an unsupported `:has()` invalidates the entire selector — so on
  the WebKitGTK build the `.deb`/AppImage may run against, every figure would
  have stayed inline. A plain `p > img:only-child` rule now carries the common
  case, with the `:has()` variant as an enhancement on top.
- **Dark-mode alert tints used `color-mix()`**, against this codebase's own
  documented convention of avoiding it for exactly this reason. Written out as
  explicit `rgba()` per alert type.
- **Tab tear-out on macOS** re-executed the binary inside the `.app` bundle
  directly. That starts a process and shows a window, but LaunchServices never
  learns about it, so the new window gets no Dock representation and doesn't
  reliably come forward — the same class of problem `AllowSetForegroundWindow`
  solves on Windows. It now uses `open -n -a` to launch a real second instance
  of the bundle, falling back to direct exec for non-bundled dev builds.

The Rust helper for that last one is deliberately not `cfg`-gated, so it is
type-checked by `cargo check` on the Windows dev machine — the macOS build only
ever happens in CI, and untypechecked platform code is how a typo surfaces
forty minutes later.

### Security

The workspace Tauri baseline, which was owed on this project before its next
stable:

- Updated the Svelte, Vite, Mermaid, DOMPurify, and related dependency line.
  The production audit now has no high, moderate, or critical findings (three
  low-severity transitive `cookie` advisories remain without a current patched
  SvelteKit release).

- **CSP was `null`; it is a strict policy now.** Combined with unfiltered raw
  HTML, that was a real execution path rather than a theoretical one — this app
  opens arbitrary `.md` files from disk.
- **GFM's tag filter is on**, neutralising `<script>`, `<iframe>` and friends.
  Everything raw HTML is actually wanted for — `<details>`, `<div align>`,
  badges, comments — still renders.
- **The `fs` plugin and its unscoped read/write capabilities are gone.** The
  frontend never imported it; all file access goes through commands using
  `std::fs`. Granting the webview filesystem access bought nothing and,
  alongside the two items above, completed an exfiltration path.

- **Optional Groq and Anthropic API keys now live in the OS keyring** — Windows
  Credential Manager, macOS Keychain or Linux Secret Service. On first launch,
  a legacy plaintext value is migrated and removed from `settings.json` only
  after the secure write succeeds. A marked file fallback is created only when
  the native keyring genuinely fails, then retried on the next launch. This
  closes the final item in the workspace Tauri security baseline.


## 0.6.0 — 2026-07-25 (Stable)

Reading-comfort release. Every tab keeps its own place, the outline tells you
where you are, the side panel gets out of the way when you want it to, and the
content-width control finally shows what it does.

### Added — Reading position memory + resume ribbon

- **Per-tab scroll positions.** Each tab now owns its scroll offset. Reading
  the bottom of one file and switching to another no longer drags the second
  file's view along with it — the long-standing complaint. Switching back puts
  you exactly where you were.
- **Resume across sessions.** Close md-reader, reopen the file, and you land
  where you stopped reading. Positions are stored per file path, capped at 200
  entries with the oldest evicted first.
  - Each position records *two* coordinates: the source line of the top-most
    visible block, and the scroll ratio. The line anchor is what survives a
    font-size, zoom or content-width change, and edits made below your reading
    position; the ratio is the fallback for when that block no longer exists.
- **The ribbon.** On resume, a hairline accent rule marks the spot with a small
  "you left off here" tag. It's bright for a few seconds, then settles to a
  whisper so it stays findable without competing with the text. Click the tag
  to dismiss it.
- **Gutter marker.** Once the ribbon has scrolled out of view, a slim marker
  appears in the right gutter at the mark's depth — click it to travel back.
  Same job as Word's scrollbar bookmark.
- Both are controlled in Settings → Reading position, along with a "Forget
  saved positions" button. Per-tab retention is unconditional; the setting
  governs only whether positions are written to disk for the next session.

### Added — Outline scroll-spy and visual rework

- **The outline follows you.** As you scroll, the heading whose section you're
  reading stays highlighted and the highlight travels with you. The active
  entry auto-scrolls into view within the outline when it drifts off.
- **New heading parser** (`src/lib/outline.ts`) — handles setext headings
  (`Title` over `===`), skips fenced code blocks, strips inline markdown from
  entry labels, and dedupes slugs exactly the way `post-render.ts` assigns
  them. Recognising setext isn't cosmetic: the renderer emits those as real
  `<h1>`/`<h2>`, so a parser that missed them desynchronised the outline from
  the document.
- **Navigation is line-based, not slug-based.** Clicking an entry resolves
  through comrak's `data-sourcepos`, so duplicate heading text now jumps to the
  right occurrence instead of always the first one.
- New `src/lib/view-nav.svelte.ts` carries active-line / progress state between
  the Viewer and the outline, using source lines as the shared coordinate.

### Fixed

- **"Outline" was rendered twice** in the side panel — the panel's section
  header and the outline component both drew the title.

### Added — Side panel: collapse, hover-peek, movable dividers

- **One button for the whole panel**, ChatGPT-style, at the left of the
  toolbar. Collapsing keeps your section choices intact so expanding restores
  exactly what you had. Previously the only way to clear the panel was to
  switch both sections off individually — which then lost those choices.
- **Hover-peek.** While collapsed, hover the window's left edge and the panel
  slides out over the content for as long as you need it, with a grace period
  so a diagonal mouse path doesn't kill it mid-reach. A pin button docks it.
- **Movable Files / Outline divider** — drag to give either section more room,
  double-click to reset.
- **Better width resizer** — pointer capture so fast drags don't drop the grab,
  double-click to reset, arrow-key resizing.
- The 📁 / 📑 buttons keep their existing job of choosing *what* the panel
  shows, and now also un-collapse it when you ask for a section.

### Changed

- **`Ctrl+B` now collapses / restores the side panel** rather than toggling the
  Files section specifically. It's the near-universal binding for that action
  (VS Code, ChatGPT, Obsidian), and the panel is the more useful thing to give
  the most memorable shortcut to.
- **`Esc` closes one layer at a time**, outermost first, and now also closes
  the diff sidebar.

### Changed — Content width control

- The `86ch` badge is gone. In its place is a miniature page with lines of text
  on it, where the text block is exactly as wide as your real content column.
  You read the current state at a glance and the mapping to the ‹ › buttons is
  self-evident — no unit vocabulary required.
- Three ways to drive it: the buttons (8ch steps), dragging across the page
  glyph, and the wheel. Double-click resets to the default. The number is still
  there, shown on hover, where it informs rather than clutters.
- Keyboard support on the glyph itself (arrows, Home/End, Enter for full width),
  with proper `role="slider"` semantics.

### Fixed — Live Edit Theatre audit

A full pass over the Theatre module. Everything below was a real defect.

- **Per-card LLM summaries showed the whole document.** The sidebar's ✨ Summary
  button always sent `snapshotBefore` / `snapshotAfter` for the entire turn and
  cached the result against the turn id — so the moment you asked one card for a
  summary, *every* card showed the same whole-document text. It now summarises
  that section's own before/after and caches per section, which is what the
  design doc asked for: summarise the one paragraph you care about without
  burning tokens on the whole file.
- **Leader lines only moved once every 400ms.** `SidebarConnectors` attached its
  scroll listener to `.content`, which isn't the scroll container (`.viewer`
  is), and scroll events don't bubble — so the listener never fired and the
  connectors relied entirely on a polling fallback. Fixed, and the always-on
  `setInterval` is replaced by a `ResizeObserver` + `MutationObserver` pair that
  costs nothing when the document is idle.
- **Summaries and per-card mode were lost on close.** Both lived in the
  sidebar's local state, and the sidebar unmounts whenever it closes — so every
  reopen re-fetched (and re-billed) the API. They now live on the `Turn`.
- **`Turn.startedAt` was always equal to `finishedAt`** (`Date.now() -
  (Date.now() - Date.now())`). The real turn-start timestamp is now captured
  when the turn opens, and the sidebar's turn picker shows how long the turn
  took — a 3-second nudge reads very differently from a 4-minute rewrite.
- **Dismissing mid-turn wedged the state machine.** `dismiss()` left
  `pendingTurnBefore` set, which made `finaliseTurn`'s phase guard reject the
  turn forever: the in-flight edits never reached the ring buffer and the
  sidebar reported "This turn (in progress)" indefinitely. Dismissing now
  finalises the turn first.
- **There was nothing to dismiss.** The status bar said "pause to dismiss"
  during an active turn while offering no control. It now has a real Dismiss
  button — which is what made the bug above reachable in the first place.
- **`ResumeChip`'s visibility test carried a clause that could never be true**
  once the preceding condition had been asserted. Reduced to what it meant.

### Added — Live Edit Theatre

- **Sidebar cards navigate.** Click a card's heading and the document scrolls to
  that section. Removed sections render as non-interactive with an explanation
  rather than a dead link.
- **Per-card change counts** — "6 lines changed", "12 lines added".
- Focus lands in the sidebar when it opens, and `Esc` closes it.

### Accessibility

- `prefers-reduced-motion` is now honoured throughout: the theatre's pulsing
  highlights, status-bar dot, chip and banner animations, the side panel's
  hover-peek slide, the resume ribbon's reveal, and the width control's
  transitions all stop moving. None of them carried information in the motion.
- Keyboard support on the new controls: arrow keys on the width glyph and on
  both panel dividers, `Home`/`End`, `aria-valuenow` / `aria-current` where
  they belong.

### Internal

- New `--accent-active` palette token (per-theme) for the outline's current-row
  fill. Defined per theme rather than derived with `color-mix()`, which isn't
  available on the older WebKitGTK that some Linux users will have — a silently
  dropped declaration there would have taken the dark-mode highlight with it.
- `npm run check` is at 0 errors, 0 warnings.

## 0.5.1 — 2026-05-15

### Added — Sepia reading theme + toolbar 3-way theme switch

- **Sepia theme** — a warm cream-paper palette tuned for low-strain
  long-form reading. Background `#f4ecd8`, text `#4a3f33` (≈6:1 contrast,
  comfortably above WCAG AA), warm-umber accents/links so the page reads
  as one coherent surface. Pick it from the new toolbar switch or
  Settings → Theme.
- **Toolbar theme switch** — a minimalistic 3-way segmented control on
  the right side of the header: ☀ Light · ◐ Sepia · ☾ Dark. One click,
  no menu. Stays in sync with the Settings → Theme value.
- **Code-block surface** now reliably uses the themed `--code-bg` instead
  of syntect's inline white — adds `!important` on `.viewer pre`
  background so sepia (and future themes) aren't subverted by syntect's
  hardcoded surface color.

### Settings

- `ThemeMode` extended to `"auto" | "light" | "dark" | "sepia"`. Existing
  values migrate unchanged.
- New helper `effectiveThemeName(theme)` in `settings-store.svelte.ts`
  resolves the user choice to the concrete `data-theme` attribute value.

## 0.5.0 — 2026-05-14

Theatre v2 — addresses three real-world issues with the v0.4.0 Live Edit
Theatre, plus adds a free LLM provider option for the diff sidebar's
summary mode.

### Changed — Theatre visual rework

- **Recede, don't shrink.** Replaced the v0.4.0 `transform: scale(0.78)`
  zoom-out (which left a floating mini-viewport with empty space around it)
  with a subtle surface "recede": gentle inset shadow + slightly muted
  saturation. Page stays full-size, layout doesn't break, the cue is still
  obvious without feeling like the app broke.
- **Two-phase highlights.** Edited blocks now glow **green with a soft
  pulse** while the AI is actively writing them, then fade to **yellow**
  ~1.5s after the last touch — instead of everything turning yellow at once.
  When a 100-paragraph file gets rewritten in stages, you see a wave of
  green sweep through, leaving yellow trails. Much easier to follow what's
  happening right now vs. what's happened earlier in this turn.
  - Driven by a new `previousSourceForDelta` per-tab snapshot, plus a
    decay loop that demotes fresh ranges to stale after the configured TTL.

### Added — Diff sidebar leader lines

- **Word-comments-style connectors.** Each card in the sidebar now draws a
  bracket on the right edge of its matching paragraph in the viewer and a
  thin curve back to the card. Scrolling either side keeps the connection
  attached (rAF-throttled redraws on viewer scroll / sidebar scroll / window
  resize). Off-screen cards or paragraphs are skipped — no leader lines
  trailing into chrome.
- New `src/lib/theatre/SidebarConnectors.svelte` — viewport-fixed SVG
  overlay, driven off the existing section list and `data-card-section-index`
  attributes on cards.

### Added — Multi-provider LLM (Groq + Anthropic)

- **Groq Cloud is now the default** smart-diff provider — free tier with no
  card. Settings → Smart-diff has a provider toggle and per-provider key +
  model fields. Defaults to `llama-3.3-70b-versatile`; other free-tier
  Llama 4 Maverick / Scout / 3.1-8B options in the model picker.
- **Anthropic remains** as the alternative, unchanged behaviour. Existing
  key carries over.
- New `src/lib/llm/` module: `types.ts`, `anthropic.ts`, `groq.ts`,
  `index.ts` (dispatcher with FNV-1a result cache).
- `src/lib/smart-diff.ts` removed — its sole caller (`DiffSidebar.svelte`)
  now imports from `$lib/llm`.

### Settings

- New: `llmProvider` (`"groq" | "anthropic"`, default `"groq"`),
  `groqApiKey`, `groqModel`.
- Existing `anthropicApiKey` / `anthropicModel` unchanged.

### Notes

- v0.5.0 ships on the **Nightly / Pre-release** channel. v0.3.0 remains the
  stable "Latest" badge on GitHub releases.

## 0.4.0 — 2026-05-13

### Added — Live Edit Theatre (opt-in, off by default)

The headline of v0.4.0 — a new product mode that activates when an external
edit is detected on the file you have open. Enable via
**Settings → Advanced features → 🎬 Live Edit Theatre**.

When enabled:

- **Smooth zoom-out animation** + faint background desaturation when an
  AI (Claude, ChatGPT, Cursor, etc.) starts writing to the active file.
  Reads as "I know something is happening — watch the show."
- **Bottom-left status bar** during the turn: live change count and a
  pulsing indicator. Morphs to "Edits done — X highlighted" with
  Dismiss / Show details buttons once edits stop for 5 seconds.
- **Yellow highlights** painted on every changed section via comrak's
  `data-sourcepos` mapping. Stay visible after dismiss; toggle with the
  floating "Show / Hide changes" chip top-right of the viewport.
- **Diff sidebar** (`Ctrl + Shift + D` or "Show details" button) — a
  Word-comments-style right panel listing every changed section as a
  card. Two modes per card:
  - **Naive diff** — red strikethrough / green underline inline diff via
    diff-match-patch. Fast, local, no network.
  - **✨ Summary** — prose summary by Claude, fetched on demand. Reuses
    the existing Smart-diff Anthropic API key from Settings.
- **Turn ring buffer** — the last 10 AI turns are kept in memory per tab.
  Dropdown at the top of the sidebar lets you re-view any of them as a
  frozen artefact ("v3 — 2 min ago") plus a cumulative "Since file
  opened" option. Lost on app close (in-memory only).
- **Discoverability tip** — users who haven't enabled Theatre yet see a
  one-time bottom-of-screen banner when an external edit first arrives.
  Click "Enable" to flip the toggle, or ✕ to dismiss.

### Stack additions

- `diff-match-patch` 1.0.5 (~30 KB) for naive-diff rendering.
- New `src/lib/theatre/` module: `types.ts`, `diff-engine.ts`,
  `store.svelte.ts`, `StatusBar.svelte`, `ResumeChip.svelte`,
  `TipBanner.svelte`, `DiffSidebar.svelte`.

### Architecture

- Theatre state lives on each `Tab` object (in-memory, lost on close —
  by design). 10-turn ring buffer caps per-tab memory at ~1 MB for a
  50 KB file. Bundle delta: ~30 KB. App startup time unchanged.
- External edits route through `tabs-store.setActiveSourceFromDisk`,
  which invokes `theatre/store.onBeforeExternalEdit` and
  `onAfterExternalEdit` to drive the state machine. Pure functions on
  reactive Tab fields — no separate state container.
- See `docs/proposals/live-edit-theatre.md` for the full design rationale,
  state machine, and the locked decisions from the 2026-05-13 debate.

## 0.3.0 — 2026-05-13

### Added
- **About dialog** — accessible from the File menu. Shows version, repo,
  license, and quick links to release page + bug/feature reports. Opens
  external links in the system browser (not the webview).
- **Advanced features** settings section — single toggle for Live Edit
  Theatre (stub in v0.3.0, full feature lands in v0.4.0). Off by default.

### Fixed
- **Tab tear-out z-order** — when you drag a tab out of the window, the
  new window now reliably comes to the front instead of opening behind
  the original window. Fixed on Windows by transferring foreground rights
  to the child PID via `AllowSetForegroundWindow` plus an explicit
  `set_focus()` on the child side.

### Changed
- **Toolbar cleanup** — `📡 Track` and `🔍 Diff` buttons removed entirely.
  The `Ctrl+L` and `Ctrl+D` shortcuts they backed are gone too. The
  features are being repackaged as Live Edit Theatre in v0.4.0 — see
  `docs/proposals/live-edit-theatre.md`.
- **Toolbar visual structure** — content-width and zoom now sit in two
  distinct segmented groups with a vertical divider between them and the
  find/settings cluster. The settings cog is slightly larger and more
  clickable.
- The `📡 live` middle-toolbar badge (file-changing pulse) was removed.
  v0.4.0 reintroduces the external-edit signal as the Theatre status bar.
- **Smart-diff** banner removed from the top of the viewer. The Anthropic
  API key in Settings stays — v0.4.0 will reuse it for the per-section
  LLM summary in the diff sidebar.

### Removed (settings)
- `experimentalLiveTrack`, `experimentalDiffMode` setting keys. The
  legacy `liveTrack` and `diffMode` keys are left in the schema for now
  so existing `settings.json` files load cleanly; they're ignored.

## 0.2.0 — 2026-05-11

### Added
- **Smart edit mode** — WYSIWYG markdown editing powered by
  [Milkdown / Crepe](https://milkdown.dev). Markdown symbols (`##`, `**`,
  `[…](…)`) are never visible while editing. Floating toolbar on selection,
  slash menu for blocks, inline tables, code blocks, KaTeX math. Becomes the
  new default for `Ctrl+E`. Switch to raw markdown source via the toolbar
  sub-toggle or Settings → Default edit mode.
- `editorMode` setting (`"smart" | "raw"`) — picks the default editor used
  when entering edit mode.
- Settings → Experimental section.
- `test-fixtures/round-trip.md` — grab-bag fixture for verifying round-trip
  fidelity in smart edit mode.

### Changed
- Live AI edit tracking and Diff mode (with the ✨ Why? smart-diff summary)
  have both moved to **Settings → Experimental**, off by default. The 📡
  Track button, 🔍 Diff button, and their `Ctrl+L` / `Ctrl+D` shortcuts
  are hidden until you opt in. Existing users with `liveTrack: true` or
  `diffMode: true` are migrated automatically.
- `Ctrl+E` now cycles **View ↔ Smart edit** (was View ↔ Split).
- The toolbar `View / Split / Edit` segmented control is now `View / Edit`.
  Split mode has been retired — use the Smart/Raw sub-toggle inside Edit
  to flip to the raw markdown source.
- The smart edit surface now visually mirrors the viewer (typography,
  content width, side panel) with only a faint paper-tint background
  difference to indicate the editing context.

### Migration
- The legacy `liveTrack` and `diffMode` setting keys are preserved for one
  release as migration sources. They will be removed in 0.3.

## 0.1.4 and earlier

See git history.
