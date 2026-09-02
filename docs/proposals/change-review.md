# Proposal: Changes — knowing what an agent did to your files

**Status:** **BUILT** in v0.12.0-nightly.1 (2026-09-02). Kept as the design
record — the reasoning is why the code looks like this.
**Relationship to `live-edit-theatre.md`:** *not* a replacement. See §7.
**Written:** 2026-09-02.

> **One thing changed after the owner read this.** The proposal argued for
> retiring Live Edit Theatre. He disagreed, and was right:
>
> *"The live edit thing was more of a gimmick… when I am sitting on a file, AI
> is editing, it just zooms out, shows what pieces are being edited real time.
> Can be turned on and off independently. The live feature is more of a
> utility."*
>
> So the two now coexist as independently switchable features doing different
> jobs — the theatre is a spectacle you opt into while watching, Changes is the
> record kept on your behalf. §7 below is rewritten accordingly; everything
> else stands as designed.

---

## 1. The problem, in the owner's words

> "We are working across five markdown files. It went ahead and edited something
> in one of the places, let's say file number three… it created file number six
> and then it made some targeted edits to file number three and five. And I for
> the love of god would not be able to know 'okay, this was changed in file
> number five'."

The important part is the last sentence, and it is not about rendering. He can
ask the agent what it changed. What he cannot do is *notice*. He is reading a
strategy document; something rewrote a paragraph of it while he was in another
file; nothing anywhere told him.

So the question this feature answers is:

> **Since I last looked, what changed, and where?**

Not "show me a diff" — that is the mechanism, not the need.

---

## 2. Why the current feature does not answer it

Live Edit Theatre was built to let you *watch* an agent type: a zoom animation
when edits begin, green highlights on the lines being touched right now, decaying
to yellow after 1.5 seconds, a turn finalised after 5 seconds of quiet.

That is a design for someone who is present. The owner's case is the exact
inverse — he was **not** watching, and finds out later. Nearly every complaint
follows mechanically from that one mismatch:

| Symptom he reported | Cause |
|---|---|
| "I am still not sure how that feature works, what it highlights" | It is **off by default** (`advancedLiveEditTheatre: false`), opt-in through a tip banner. Its behaviour genuinely differs between sessions. |
| "the way it highlights is pretty ugly" | It washes **whole block elements**. `applyTheatreHighlight` adds a class to any element whose `data-sourcepos` overlaps a changed line, so one changed word colours an entire paragraph. |
| "that highlight sticking around does look ugly" | Highlights persist until the tab closes or the user finds "clear highlights". There is no notion of *reviewed*. |
| Changes sometimes show nothing at all | The diff baseline is **the content at the moment the tab opened**. A file edited while closed, then opened, has the edit already in its baseline → zero highlights. This is exactly his scenario. |
| Nothing survives a restart | All state is in-memory (`freshTheatreState()`), including the entire turn history. |
| **"I would not know it was file number five"** | There is **no cross-file signal anywhere** — not on tabs, not in the file tree. The actual question is structurally unanswerable today. |

Two more defects worth recording, found while reading the code:

- The green→yellow vocabulary is **time-decay** based. When changes arrive via
  the focus-refresh sweep (the common case — you alt-tab back and everything
  reloads at once) they all land together and decay within 1.5 s, so the
  distinction the visual language is built on conveys nothing.
- `changedSections` matches sections by exact `(heading text, level)`. Renaming
  a heading reports the section as one deletion plus one addition, and two
  sections sharing a name (`## Notes`) can mis-pair.

**Conclusion: this is not tunable into shape.** Theatre optimises for spectacle
at the instant of change; review optimises for recall long afterwards. They want
different storage, different triggers, different visuals, and different defaults.

---

## 3. The model

### 3.1 Unit of record

A **revision**: one observed transition of a file from content A to content B,
carrying a timestamp and an origin (`external` — an agent or another editor —
versus `local`, typed here). Within a revision, a set of **changed regions**:
contiguous ranges of blocks, in the *after* document.

A region is the thing that gets a marker. A revision is the thing that gets a
timestamp. Three separate tweaks to one paragraph are three revisions each
containing one region over the same span — which is precisely the "three
iterations" case he described.

### 3.2 Storage

`.foxmd/<name>.history.json`, beside the document — the same sidecar convention
annotations already use, chosen for the same reasons: it travels with the file,
it is on OneDrive when the file is, and **an agent can read it**.

- Markdown is small. Keep the last 50 revisions or ~2 MB per document,
  whichever comes first, then drop the oldest.
- Store full snapshots, not patches. Simpler, and at this size the saving from
  patches is not worth the class of bug it buys.

What this changes versus today: history survives a restart, survives closing the
tab, and — because the sidecar syncs — survives moving to his other laptop.

### 3.3 When does something count as changed?

This is the question he asked to have sharpened, and it is where the current
design goes wrong. The answer:

> **Mark by what the reader has seen, not by how long ago it happened.**

Rules:

1. A region becomes **unreviewed** the moment Fox MD observes content differing
   from its last-known snapshot — via the watcher, the focus sweep, a manual
   refresh, or opening the file.
2. It stays unreviewed until *he* acknowledges it. **No time decay, ever.** Decay
   is what makes the current feature feel arbitrary: information disappears on a
   timer he did not set and cannot see.
3. His own edits in the app never mark. He knows what he typed.
4. Acknowledgement survives scrolling away, switching tabs, and restarting.

### 3.4 When does it get dismissed?

Three explicit routes, and no implicit one:

- **Opening the overlay on a region** marks that region reviewed. Looking at the
  before/after *is* the act of reviewing it.
- **"Mark this file reviewed"** — one action in the toolbar, clears the file.
- **"Mark all reviewed"** in the Changes panel.

Scrolling past a region does **not** clear it. Scrolling is not reading, and
auto-clearing would silently destroy the only record he has that something
happened. (An optional "clear after a region has been centred in the viewport
for 3 s" could exist in Settings. Recommended **off** by default.)

---

## 4. The visuals

### 4.1 A bar in the margin, not a highlight in the prose

His instinct is right, and it is where every serious tool has landed: VS Code and
JetBrains put change bars in the gutter, Word has drawn a changed-line bar in the
margin for thirty years, Google Docs marks the margin rather than the text.

The reason is that a document has two planes. The prose is the content; the
margin is where the software is allowed to talk. Recolouring prose puts the
software's commentary *inside* the thing you are trying to read, which is why it
looks wrong no matter which colour is chosen.

- A **3px vertical bar** in the left margin of the content column, spanning
  exactly the blocks that changed.
- Tinted by kind: added, changed, removed. A removal has no height to span, so
  it draws as a small caret between the two surviving blocks.
- **The prose is never recoloured.** This alone fixes "it looks ugly".
- Unreviewed bars are solid; reviewed ones fade to a faint tint (still visible,
  so "this changed at some point" remains answerable), or hide entirely under a
  toggle.

### 4.2 Repeated edits to the same place

He asked for one line per iteration — three tweaks, three bars.

**Recommendation: one bar carrying a count, not three parallel bars.** Three
rules inside a ~14px gutter are hard to distinguish and hard to hit, and the
gutter cannot grow without eating the reading column. The iteration history
belongs in the overlay, which has room to show it properly.

So: the bar gains a small numeral when a region has more than one revision, and
the overlay gets a stepper — `v1 → v2 → v3`, with arrow keys. Nothing is lost;
it is relocated to where there is space for it.

If, seeing it, he still wants stacked bars, that is a small change to the same
data model — the model records per-revision regions either way.

### 4.3 The overlay: before above, after below

His instinct here is right too, and worth stating the reason for: side-by-side
halves the column width, so the two versions wrap differently and the eye has to
re-find its place on every single line. Stacked keeps identical wrapping, so an
altered word sits at the same position in both and the difference *pops*. This is
why GitHub's unified view beats split for prose while split wins for code.

- Before on top, after below. Same width, same font, same measure as the
  document.
- **Word-level** inline diff within the pair. The current engine runs in
  line-mode, which marks a whole line when a single word moved — a large part of
  why today's output reads as noise.
- Header: relative time ("14 minutes ago"), origin, and the revision stepper.
- **Opens on click**, not hover. Hover-to-open is right for a tooltip and wrong
  for a panel you intend to read; it would fire constantly while scrolling.
  Hover shows a one-line preview instead: *"3 paragraphs changed, 14 min ago."*
- Escape or click-away closes. Animate the height so the document visibly makes
  room, rather than being covered.

---

## 5. The cross-file half — the part that actually solves his problem

Everything above is worthless for his stated case if he has to already be looking
at the right file. Four surfaces:

1. **A dot on the tab**, with a count, for any file holding unreviewed changes.
   The strip already has a slot for it (the unsaved-changes dot) and a rule for
   how it behaves.
2. **A dot in the file browser**, on files and on the folders containing them.
   Necessary, not optional: in his example *file six was created* and files that
   were not open were edited. A tab badge cannot express either.
3. **A "Changes" panel** — everything unreviewed across the current folder,
   newest first, grouped by file, each row jumping straight to the region.
   This is the "I stepped away; what did it do?" view, and it is the hero of the
   feature. If only one thing gets built, build this.
4. **New files listed as new**, distinct from changed.

### The cost, honestly

The watcher (`watcher.rs`) arms itself on exactly one file — the active tab.
Nothing above works for closed files without watching the **folder**: recursive,
debounced, with an ignore list (`.git`, `node_modules`, `.foxmd`). That is the
main engineering cost and the main risk, because `ReadDirectoryChangesW` is
documented-unreliable on OneDrive and the existing mtime-poll fallback would have
to become a folder poll. It is the reason this is a project rather than a UI
tweak, and it should be sized before anything else is agreed.

### The honest limit

Fox MD can only diff against a version it has seen. A file it has never opened
has no "before", and nothing can conjure one. Mitigation: **snapshot on first
open**, so every file acquires a baseline the moment he first reads it — which is
exactly when he would want one. Until then, a file shows as "not tracked yet"
rather than as "unchanged", because those are different statements and conflating
them is how the old feature came to show nothing and look broken.

---

## 6. Does OneDrive already do this?

He asked directly. Short answer: it keeps versions, but it is the wrong tool for
this question.

OneDrive does retain version history for all file types, restorable from the web
UI or Explorer's right-click → Version history. Three reasons not to build on it:

- **Granularity is wrong.** Versions are cut on *sync*, which is debounced, so a
  burst of agent edits collapses into one version — and the timestamps are sync
  times, not edit times.
- **Resolution is wrong.** Whole-file restore. There is no "which paragraph",
  which is the entire question.
- **It is out of the app.** Answering "what changed" should not require a browser
  round-trip.

It remains a good safety net for *recovery* — which is not what he asked for; he
was explicit that he does not primarily want to revert. The sidecar gives exact
granularity, works offline, and can be read by an agent.

Worth noting the bonus: because `.foxmd/` sits beside the document, on OneDrive
the change history **syncs between his machines for free**.

---

## 7. Two features, not one — and why the theatre stays

The first draft of this proposal argued for retiring Live Edit Theatre on the
grounds that it answers the wrong question. That was half right and led to the
wrong conclusion.

It *does* answer a different question. But "different" is not "wrong", and the
owner's correction is the clearer framing:

| | Live Edit Theatre | Changes |
|---|---|---|
| Answers | "what is being written **right now**" | "what was written **while I was away**" |
| You are | watching | returning |
| Lifetime | the moment; forgets on tab close | a record, on disk, across restarts |
| Default | off — you opt in to watch | **on** |
| Storage | in-memory | `.foxmd/changes.json` |

They share no state and neither reads the other's settings. Both can be on, both
off, either alone.

The defaults follow from the difference. The theatre is off because watching an
agent type is something you choose to do. Changes is **on** because a record is
only useful if it was already being kept before you thought to want it — an
opt-in history is guaranteed to be empty the first time anyone goes looking, and
that first time is exactly when they needed it.

**Naming:** the utility is called **Changes** everywhere it appears — the
toolbar clock, the panel, the settings group. "Live Edit Theatre" keeps its name,
which is accurate for what it actually is.

---

## 7a. What "smart" timestamps had to mean

Added after the owner's second note, and it is the requirement that shaped
`changes/time.ts`:

> *"The difference in the diffs can be a few minutes only — minutes should be
> shown; versus days apart; versus what happened on a particular date. I know
> all the way from 8–10pm, 20th March 2026, Sunday."*

Resolution is not fixed; it follows the **spread** of what is being described.

- Edits within 45 minutes of each other are one **session**. Inside it the
  informative number is the offset from the previous edit — `+2 min` — because
  every entry in a burst shares the same absolute minute.
- A session gets a heading naming the day and the hours it spanned.
- How the day is named is a ladder: `Today` → `Yesterday` → the weekday →
  the date → the date with a year. A weekday name is the most useful label
  inside a week and useless beyond it, where "Sunday" names a Sunday without
  saying which one.

Producing, respectively: `Today, 8:04–10:12 pm` · `Sunday, 8–10 pm` ·
`Sun 8 Mar, 8–10 pm` · `Sun 9 Mar 2025, 8–10 pm`.

Two decisions inside that are easy to get wrong and are pinned by tests:
timestamps come from the file's **mtime**, not from when the scan noticed
(otherwise two hours of agent work collapses into the single instant you
alt-tabbed back); and "days apart" is counted by **calendar date**, not elapsed
milliseconds, because 11pm and 1am are two days apart to a reader and two hours
apart to arithmetic.

## 8. Suggested order of work

Each step is useful on its own, which is deliberate — the sequence can be stopped
at any point without leaving a half-feature.

1. **Sidecar history + snapshot on open.** No UI. Starts accumulating the record
   immediately, so later steps have data to show. Retires the in-memory model.
2. **Margin bars + the stacked overlay**, on the active file only, word-level
   diff. This is the visible replacement for today's highlights.
3. **Tab and file-tree badges.** First moment the cross-file question gets an
   answer.
4. **The Changes panel** and folder watching. The largest step, and the one that
   fully answers the original complaint.
5. Retire the theatre code and the `advancedLiveEditTheatre` flag.

---

## 9. What was decided, and what is still open

Resolved while building:

1. **One bar with a count**, not one per revision — §4.2. The overlay's stepper
   carries the iteration history instead. Reversible: the model records
   per-revision either way.
2. **Reviewed changes fade rather than vanish**, controlled by
   `keepReviewedMarks` (Settings → Changes), default on.
3. **40 revisions per file**, then the oldest drops. Regions rather than
   whole-file snapshots is what makes that affordable.
4. **Scanning, not watching, and only folders you have opened a file from.**
   The proposal worried about the cost of a recursive watcher on OneDrive; the
   answer was to not build one. A scan on focus cannot miss an event it never
   received, which is the specific way `ReadDirectoryChangesW` fails on
   OneDrive. Depth is capped at 4 and the file count at 4000.

Still open, and worth revisiting once it has been used in anger:

- **Files never opened are not tracked.** They have no baseline, so there is no
  "before" — a file an agent *creates* is only noticed once you open it. Fox MD
  could baseline every markdown file in a scanned folder instead, at the cost of
  copying files you have never read into `.foxmd/`. Deliberately not done yet.
- **The 45-minute session gap** is a judgement, not a measurement.
- **Should a region clear itself** after sitting centred in the viewport for a
  few seconds? Recommended against as a default; still recommended against.
