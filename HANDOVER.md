# Handover — Fox MD (repo: md-reader)

> Self-contained context for whoever (human or AI) picks up this project next.
> Last updated **2026-08-26**: **v0.9.0 is stable `latest`** (Page preview,
> in-app updates, the dismissible resume mark, Settings drawer, file sorting).
> **v0.10.0-nightly.3** is the current pre-release: highlights and threaded
> comments with an agent-readable sidecar, a rule-based `.docx` exporter, smooth
> scrolling, a measured content-width ceiling, Ctrl/Alt+wheel gestures — and
> highlight/comment now properly separated (see the first entry in
> `docs/DECISIONS.md`).

## 2026-09-02 — tab reordering, the macOS Finder bug, and a change-review proposal

Three fixes shipped in **v0.11.0-nightly.3**, plus one design document that is
waiting on a decision and must not be built until he answers.

### Two traps worth carrying forward

1. **`dragDropEnabled: true` in `tauri.conf.json` kills HTML5 drag-and-drop in
   the page.** It installs an OS drop target (which Fox MD needs — dropping a
   `.md` on the window opens it), and the webview then never delivers
   `dragover`/`drop`. `dragstart` still fires, so the failure is asymmetric and
   confusing: tab tear-out worked (it keys off `dropEffect === "none"`) while
   reordering silently did nothing. **If any drag feature here is half-dead,
   check this flag before reading the handler.** Tab dragging is now pointer-based
   (`src/lib/tab-drag.ts`) and independent of it.

2. **`getBoundingClientRect()` includes transforms; `offsetLeft`/`offsetTop` do
   not.** Measuring the tab strip with rects put a dragged tab three slots wrong
   whenever a previous drag's 150 ms landing animation was still running. This is
   the second time this rule has been learned in this repo (the Viewer's outline
   probe was the first). For anything reasoning about *structure* rather than
   about what is on screen, use layout coordinates.

### macOS Finder opens — fixed, but NOT verified on hardware

Double-clicking a `.md` in Finder opened an empty window. macOS does not pass the
file in `argv`; it sends an open-documents Apple Event, surfaced as
`RunEvent::Opened`, which needs `build()` + `run(callback)` instead of plain
`run()`. `lib.rs` now handles it and parks paths in the existing `InitialFiles`
queue when the webview has not mounted yet.

The missing OneDrive permission prompt he also reported is the *same* bug: macOS
prompts when an app first reads a protected location, and this one never got as
far as reading.

⚠️ **This machine is Windows and `cargo check` does not compile the macOS branch
at all.** CI's macOS job is the first genuine check; Finder is the second, and
only he can run it.

### Verifying UI here

`?devmock=1` now serves a **library** of documents rather than one, with
deliberately uneven filename lengths — reorder arithmetic over equal-width tabs
will pass a broken implementation. `plugin:dialog|open` is mocked, so the "+"
button fills the strip.

Two Browser-pane limits cost time and will again: the **CDP synthetic drag does
not produce the pointer events these handlers read** (dispatch `PointerEvent`s
from `javascript_tool` instead), and a **hidden pane composites no frames**, so
`requestAnimationFrame` never resolves (a `rAF` await hangs until timeout) and
`getComputedStyle` returns pre-transition values. Read `el.style.transform` for
the intended value, and use `setTimeout` to wait.

### Awaiting a decision — do not build yet

`docs/proposals/change-review.md` replaces `live-edit-theatre.md`. He asked for
the change-highlighting to be remodelled and explicitly asked to be consulted
before implementation. Summary of the argument: the current feature is built for
*watching* an agent type, and his need is *reviewing* what happened while he was
away — from which nearly every complaint follows. It proposes margin change bars
instead of prose highlights, a stacked before/after overlay, a `.foxmd/`
history sidecar so the record survives restarts and syncs between machines, and
— the part that actually answers his complaint — cross-file badges plus a
Changes panel. §9 lists four open questions for him.

## 2026-08-28 — Handover is built, both halves

Sign in with Google on the desktop (Settings → Handover) and on the phone, and
each machine publishes its open documents for the others to pick up. The
Supabase schema was applied by the owner on 2026-08-27 and **verified from here**
against the live project: `md_open_tabs` and `md_refresh_requests` exist and
correctly refuse anonymous reads, `devices.fox_md_label` exists, Google is an
enabled provider, and both redirect URLs (`http://localhost:47821/callback`,
`foxmd://auth-callback`) are already allow-listed — so there is no dashboard
step outstanding.

**Where the code is.** Desktop: `src-tauri/src/{supabase,auth,handover}.rs`
plus `src/lib/account.svelte.ts` and `AccountPanel.svelte`. Phone:
`app/src/main/java/com/foxmd/android/sync/` in `md-reader-android`.

### The three rules that matter

1. **Auth never touches the webview.** Fox MD renders arbitrary markdown with
   raw HTML enabled; the strict CSP with no external `connect-src` is what
   stops a document reaching the network. A Supabase session in the page would
   mean widening that CSP to the API origin, and then any document you opened
   could call it *with your session attached*. The page asks "am I signed in?"
   and gets a name and an email. **Do not move auth into the frontend.**
2. **Only an explicit rejection is a logout.** A 500, a timeout or a captive
   portal leaves the stored refresh token alone to retry. Clearing on any
   failure is how an app loses a session to a café network.
3. **Refresh is serialised.** Supabase rotates the refresh token on every use
   and revokes the old one, so two concurrent refreshes leave one holding a
   revoked token — the mechanism behind most mystery logouts. Desktop uses a
   `tokio::sync::Mutex` (**not** `std::sync`: its guard is held across an
   `.await`, and a `std` guard is `!Send`, which Tauri rejects with "future
   cannot be sent between threads safely" from inside a macro expansion that
   names none of this). Android uses `kotlinx.coroutines.sync.Mutex`.

### Testing

`cargo test` still cannot run in the app crate. `tools/handover-selftest`
slices the real `supabase.rs`/`auth.rs`/`handover.rs` the way
`updates-selftest` already does — 13/13, and it immediately caught a wrong
leap-day expectation. Android is 37/37; its new parsing tests caught that an
out-of-range timestamp parsed to a plausible instant instead of zero, which
would have let a dead machine render as live.

### Two R8 traps, if the Android release build ever fails again

`security-crypto` pulls in Tink. Its Error Prone annotations are compile-time
only and R8 treats them as **errors**, not warnings; and a blanket
`-keep class com.google.crypto.tink.**` pins `KeysDownloader` alive, which then
drags in google-api-client and joda-time. Both are handled in
`app/proguard-rules.pro`; read the comments there before touching it.

## 2026-08-27 — one update module, shared across all four Fox desktop apps

`docs/UPDATES.md` is the contract; **the same `src-tauri/src/updates.rs` and the
same `UpdatePanel.svelte` now ship in wispr-fox, FoxCull, Fox MD and Fox Mark**,
differing only in three constants. Fix a bug in one, copy it to the other three.

What it buys: two channels visible at once, and on Windows an Install button
that downloads, runs the NSIS installer **silently** (`/S /R`) and relaunches —
no wizard, no uninstall/reinstall. macOS and Linux download and open, which is as
far as an unsigned build can honestly go.

Three things that will silently break it, all documented in `docs/UPDATES.md`:
a nightly published as a **draft** is invisible to the API; a **renamed CI
artifact** degrades Install to "no installer for this platform" rather than
erroring; and a **string-compare** version check sorts `nightly.10` below
`nightly.9`. The last two are pinned by `md-reader/tools/updates-selftest`, which
slices the real `updates.rs` rather than restating it — 9/9 passing.

Local to this repo: the v0.9.0 updater was the prototype for all of this. Its
commands were renamed for consistency (`check_updates` → `update_status`,
`install_update(url, name)` → `download_and_install(tag)` — the tag form never
lets a URL cross the IPC boundary), streaming download with a progress bar and a
size check were adopted from wispr-fox, and the hand-rolled Settings block was
replaced by the shared panel. The self-test harness lives here at
`tools/updates-selftest` and verifies all four apps at once.


## Read these three first

| Document | What it holds |
|---|---|
| **This file** | The state of the world: what is released, what the traps are, how to ship. |
| **`docs/DECISIONS.md`** | *Why* the product is shaped this way — every ask, the reasoning behind it, what was hard, what was deliberately not built. Add an entry in the same session as the work. |
| **`docs/ROADMAP.md`** | What is next, in order. Includes the narration decision and the Android sequence. |

`docs/MOBILE-PLAN.md` is the Android companion's architecture (planned, not
started). `CHANGELOG.md` is user-facing and newest-first.

## Where things stand

**Release channel policy:** **v0.9.0 is stable `latest`** (published
2026-08-26). New work goes on `v0.10.0-nightly.N`.

**Nightlies are published pre-releases, not drafts** (`release.yml` keys off
`-nightly` in the tag). This is load-bearing for the in-app updater, not a
preference: GitHub's API hides draft releases from unauthenticated callers, so a
draft nightly is invisible to the app. Stable tags still land as drafts so the
notes can be written before anyone sees them, then are published by hand
(`gh release edit vX.Y.Z --draft=false --latest --notes-file …`).

| Version | Status | Headline |
|---|---|---|
| v0.2.0 – v0.5.1 | Published | Smart edit mode, toolbar/About, Live Edit Theatre v1 and v2, sepia theme. See `docs/DECISIONS.md`. |
| v0.6.0 | Published | Reading-position memory, outline scroll-spy, collapsible side panel, visual width control |
| v0.7.0 | Published | Fox MD identity + icon, chrome/paper redesign, focus mode, context menus, completed security baseline |
| v0.8.0 | Published | Refresh from disk, mid-screen outline tracking, wrapping tables, layered surfaces |
| **v0.9.0** | **Published — stable `latest`** | Page preview, in-app updater, resume mark, Settings drawer, file sorting |
| v0.10.0-nightly.1 | Published pre-release | Highlights + threaded comments + `.foxmd` sidecar; `.docx` export; smooth scrolling; measured width ceiling; Ctrl/Alt+wheel |
| v0.10.0-nightly.2 | Tagged, never published — superseded by nightly.3 (see below) | Fixes an effect-loop risk in the annotation repaint that could have frozen every handler in the app |
| **v0.10.0-nightly.3** | **Published pre-release** | Highlight and comment unbraided: "No highlight", remove-by-overlap, right-click removal, comments no longer take a fill. Includes nightly.2. |

- **Repo**: <https://github.com/kumaradarsh1993/md-reader>
- **Branch**: `master`. v0.6.0 onwards was committed straight to master
  at the user's explicit request.
- **Vite dev port**: `1430` (a sibling Tauri project keeps 1420)
- **Local git identity (repo-local, not global)**: `Kumar Adarsh <kumaradarsh1993@users.noreply.github.com>`

### Identity and upgrade continuity

- **Displayed name:** Fox MD.
- **Repo / npm package / Rust crate / executable:** still `md-reader`.
- **Bundle identifier:** still `com.mdreader.app`.
- **MSI upgrade code:** explicitly pinned to
  `0c8e8201-1ef4-56d2-9b1d-a0a5203f2c69`, the value derived from the old
  product name. Do not regenerate it: changing it installs a duplicate app.
- **NSIS rename migration:** `src-tauri/installer-hooks.nsh` runs the old
  `md-reader` per-user uninstaller with `/S /UPDATE` before Fox MD is copied.
  Do not remove it until pre-0.7 installs are no longer supported.
- **Icon source:** `assets/fox-md-icon.png`; the old mark is backed up at
  `assets/legacy-md-reader-icon.png`. Regenerate native assets with
  `npm run tauri -- icon assets/fox-md-icon.png`.

## RESOLVED: the release-publish permission error

**Symptom (2026-08-26):** CI built all three platforms and then failed on the
last step with

```
Couldn't find release with tag <tag>. Creating one.
##[error]Resource not accessible by integration - .../releases#create-a-release
```

**Cause:** the repository's **Workflow permissions** were set to *"Read
repository contents and packages permissions"*. The `GITHUB_TOKEN` was capped at
read, so creating a release was denied.

**Fix:** Settings → Actions → General → Workflow permissions → **Read and write
permissions**. Changed 2026-08-26 with the owner's explicit go-ahead.
`can_approve_pull_request_reviews` was deliberately left `false` — nothing here
needs Actions to open or approve pull requests.

**Why this took four attempts to pin down, which is the part worth remembering.**
The workflow declares `permissions: contents: write` at its root, and GitHub's
documentation says a workflow may grant itself more than the repository default.
That reads as "the setting cannot be the cause", which is what sent the
investigation elsewhere — rulesets, access policies, `allowed_actions`, the
minutes quota (the repo is public, so there is none). Worse, the *same workflow
published twice earlier the same day*, so it looked intermittent rather than
configured. **A setting that is supposed to be overridable is still worth
checking when the error is a permission error**, and the repository Settings
page answers in ten seconds what the REST API's `default_workflow_permissions`
field does not make obvious.

**A re-run does NOT pick up the new setting.** This is the second half of the
lesson, and it is what made the fix look like it had not worked: after switching
the repository to Read and write, `gh run rerun --failed` on the *existing*
nightly.2 run failed again with the identical error, while a *fresh* run for
nightly.3 minutes later published all seven artifacts first time. A re-run
replays the original run's context, token permissions included. **After changing
workflow permissions, push a new tag — do not re-run the failed one.**

That is also why `v0.10.0-nightly.2` has a tag but no release. Its content is
entirely contained in nightly.3, so the tag was left in place rather than
re-cut; if you are comparing the tag list against the release list, that is the
discrepancy and it is deliberate.

Every one of the owner's other repos is still on `read` and releases fine from
them, so the original intermittency remains not fully explained — if another
repo starts failing the same way, the Workflow permissions page is the first
thing to look at.

## What v0.10.0-nightly.1 added

The largest release so far. Full user-facing detail in `CHANGELOG.md`; the
reasoning in `docs/DECISIONS.md`. This is the orientation for the code.

### Annotations (`src/lib/annotations/`)

```
src/lib/annotations/
  types.ts               - Anchor, Annotation, CommentNode, NotesFile
  anchor.ts              - DOM selection <-> durable anchor; block text index;
                           four-step resolution; caret hit-testing
  paint.ts               - CSS Custom Highlight API registries, one per colour
  sidecar.ts             - .foxmd paths, load/save, the markdown digest
  store.svelte.ts        - per-document state, debounced autosave, mutations
  SelectionToolbar.svelte- the bar that appears on selection
  CommentLane.svelte     - the right margin: stacking, collision, float mode
  CommentCard.svelte     - one thread, collapsed marker or expanded card
```

Six things in here are load-bearing and should not be "simplified":

0. **Fill and comment are independent properties of one anchor.** `color` is
   the highlighter (`null` = no fill, a real state); `thread` is the
   conversation. **Never branch on `kind`** — it survives in the file format as
   provenance only. The first version fused them ("a comment is a highlight
   that has something to say") and that single decision is what made
   unhighlighting impossible to express and forced a colour onto every comment.
   If these ever share a field again, all three complaints come back.
1. **Anchors carry two coordinate systems.** `(blockLine, start, length)` is the
   fast path; `quote` + 48 chars of `prefix`/`suffix` is what re-finds the
   passage after the document changes. `resolveAnchor` tries four things in
   order — named block at recorded offsets, named block by content, *any* block
   by content, then detached. Dropping the second pair makes every note fragile
   the moment an agent edits the file above it.
2. **Highlights paint through `CSS.highlights`, never by wrapping text.** The
   Find bar (`Find.svelte`) and `postRender` both already split this DOM's text
   nodes. A third text-splitting painter has to interleave with both, and the
   failure mode is silent fragments. See the header comment in `paint.ts`.
3. **`::highlight()` rules live in `+page.svelte` under `:global`.** A highlight
   pseudo-element names a document-level registry, not an element, so component
   scoping cannot reach it.
4. **The lane is reserved by `.viewer`'s padding**, not by a margin on `.prose`.
   An absolutely positioned child is laid out against the padding box, so
   `right: 0` lands the lane exactly in the reserved strip; a `margin-right` on
   a `margin: 0 auto` block would shove the column right instead of re-centring
   it. `measureGeometry()` subtracts that padding before publishing the width
   ceiling, or the ceiling would offer the lane's space to the text.
5. **`laneOn` includes `expandedId`, not just non-empty threads.** "Comment" on
   a selection creates a highlight with an *empty* thread and opens its
   composer; gating the lane on `thread.length > 0` means the box you type the
   first comment into never appears. This was a real bug, caught in the mock.

Storage is `.foxmd/` beside the document: `<name>.notes.json` authoritative,
`<name>.notes.md` generated from it every save, `README.md` written once.
Rust side: `read_text_file_opt`, `write_text_file_mkdir`,
`write_text_file_if_absent`, `remove_file_if_present`, `user_display_name`.

### Word export (`src/lib/docx/`)

```
src/lib/docx/
  zip.ts    - minimal store-only ZIP writer (CRC-32 is the only algorithm)
  parts.ts  - the fixed OOXML parts and the house format, in one place
  build.ts  - rendered HTML -> OOXML body
  index.ts  - orchestration, image resolution, save
```

- **`parts.ts` mirrors `WordPreview.svelte` deliberately.** The preview's whole
  job is to be an honest picture of the exported file. Change a number in one,
  change it in the other, or the preview starts lying.
- **OOXML child order is a schema sequence, not a style.** `CT_RPr` and `CT_Lvl`
  both are. Word rejects an out-of-order part outright with no indication of
  which element was wrong. `rPr` order and the `suff`-before-`lvlText` ordering
  in `parts.ts` are there for that reason.
- **Every ordered list gets its own `numId` with a `startOverride`.** Sharing one
  makes the second numbered list continue the first one's count — the classic
  Word bug — and it is also what lets a markdown `5.` actually start at 5.
- **`textRun` collapses whitespace the way HTML does.** A newline in a text node
  is formatting, not content; comrak emits an explicit `<br/>` for a hard break.
  Mapping newlines to `<w:br/>` put a spurious line break at the end of every
  list item containing a nested list.
- **Verified against Word itself** via COM, not against a schema validator. See
  "Useful commands" for the incantation — re-run it after any change here.

### Scrolling, width and wheel (`Viewer.svelte`, `reading-metrics.svelte.ts`)

- **Block offsets are cached, and every scroll frame is a binary search.**
  `blocksAbove` used to call `getBoundingClientRect()` in a loop, twice per
  frame. `.viewer` is the `offsetParent`, so `offsetTop` is scroll-independent
  and only has to be re-read when the layout changes; a `ResizeObserver` marks
  it dirty and the re-measure is deferred to the next probe.
- **`WIDTH_MAX` is now only a floor.** `widthMax()` asks `readingMetrics`, which
  the Viewer feeds from a hidden `20ch` probe in the document's own font. A
  constant here is what stopped a 27" monitor from ever filling.
- **Wheel gestures accumulate distance, they do not step per event.** A mouse
  notch is one 100-unit delta; a trackpad emits a stream of 2–10 unit ones.
  Registered with `{ passive: false }` by hand, because Ctrl+wheel is the
  browser's own zoom gesture and a passive listener cannot stop it.

### The dev mock (`src/lib/devmock.ts`)

`?devmock=1` in a dev build installs `window.__TAURI_INTERNALS__`, so the real
frontend runs in an ordinary browser against a fake backend — which is how every
claim about the annotation layer above was measured. Before this, there was no
way to look at a UI change short of building an installer: `cargo test` cannot
launch its harness here (the test binary links WebView2 —
`STATUS_ENTRYPOINT_NOT_FOUND`), and a Tauri window cannot be driven or
screenshotted by agent tooling.

Tree-shaken out of production by an `import.meta.env.DEV` guard in `+layout.ts`.

⚠️ **A hidden Browser pane composites no frames, so `requestAnimationFrame`
never fires.** The selection toolbar is scheduled on a rAF (to let the browser
finalise the range), so while the pane is not displayed the toolbar will not
appear no matter what you select — and it looks exactly like a broken feature.
The same limitation already bit this workspace as frozen CSS transitions and as
a `ResizeObserver` that never fired. **Front the pane, or test through the store
API instead**: Svelte's effect scheduler is a microtask and runs regardless.

**When you add a Rust command, add a handler here too** — a missing one logs
`[devmock] no handler for …` and returns `undefined`, which usually surfaces
somewhere far away.

## What v0.9.0-nightly.2 added

### In-app updater (`src-tauri/src/updates.rs` + Settings → Updates)

- **Deliberately not `tauri-plugin-updater`.** That plugin wants a signed
  `latest.json` manifest and a keypair whose private half lives in CI secrets.
  This app ships unsigned builds from a public repo, so the signing apparatus
  would buy nothing and cost a key-management story. `updates.rs` reads the
  public releases API and runs the platform installer.
- **The fetch is in Rust on purpose.** The app runs a strict CSP with no
  external `connect-src`; opening one to reach api.github.com would widen what
  every rendered page can talk to. The webview only ever sees the result.
- **Nightlies must be published pre-releases** — see the release-channel note
  above. If "latest nightly" ever shows *none published*, check that first.
- Asset picking is per-platform: Windows takes the NSIS `.exe` (the only
  Windows artifact that supports a silent in-place update), macOS the universal
  `.dmg`, Linux the AppImage.
- Windows install runs the installer with `/S /R` (silent + relaunch) and then
  exits the app 1.5s later. Both halves matter: the installer cannot replace a
  running executable, and quitting instantly races the installer's own startup.
- **Version comparison is honest about what it cannot know.** A nightly and a
  stable of the same line both report the same `CARGO_PKG_VERSION`, so the UI
  says "newer" or "same version" and never claims "you already have this exact
  build". If that ever needs to be exact, the tag has to be injected at build
  time — it is not today.
- The non-Windows install path uses `open` / `xdg-open` through
  `std::process::Command` rather than the opener plugin's Rust API, because that
  branch never compiles on the Windows dev machine and an API guess would only
  surface as a CI failure on mac/linux.

### Page preview, retuned

Measured, not eyeballed: every element in the content column computes to
`14.6667px` (= 11pt), lists report `padding-left: 0` with
`list-style-position: inside`, nested lists 16px, block quotes zero border and
zero indent, and h1/p/li/blockquote all start at x=96 (the 1in margin) with the
heading rule spanning the full 624px column.

- **One size for everything, 11pt, headings included.** A heading is bold and
  ruled here, never bigger. This was the main complaint about the first cut.
- **Zero indentation.** `list-style-position: inside` is what makes a flush-left
  marker possible — with `padding-left: 0` an `outside` marker is clipped off
  the left edge of the column. Nesting gets 12pt, enough to read as nesting.
- Block quotes are ordinary paragraphs: no bar, no indent, no italic.

## What v0.9.0-nightly.1 added

### Page preview (`src/lib/WordPreview.svelte`)

The workflow it serves: drafts are written here as markdown (often by an agent),
then have to go to a team as a Word document in the house format. The only
question before exporting is *how long is it and where do the pages break*, and
answering it used to mean actually converting the file.

- **It is a preview, not a converter.** Nothing is written; no .docx is produced.
- Geometry: US Letter (816×1056 px at 96dpi), Word "Normal" margins (1in), text
  column 624px, 9in of content per page. Body 11pt Calibri Light, line-height
  1.37 (Word's 1.08 multiple), 8pt paragraph spacing.
- **How pagination works, because this is the part worth not breaking:** the
  content is laid out *once*, off-screen, at exactly the text-column width.
  Every visual line is measured with `Range.getClientRects()` — one rect per
  line box, which is why wrapped paragraphs, tables and headings are all
  countable without assuming a line height. Rects that overlap vertically are
  merged (a bold run, an inline code span, a table row's cells are one line).
  Page breaks then land on the **last line boundary** that fits inside 9in, so a
  line is never sliced across a break. Each page renders a clipped window onto
  the same content, offset to its slice.
- The measured line array does double duty: margin line numbers and break
  positions come from the same data, so they cannot disagree.
- **`MIN_TAIL` exists for a real bug**: `scrollHeight` rounds up to a whole pixel
  while the last line's bottom is fractional, so an exact end-comparison left a
  1.5px sliver and reported one page too many. Measured before/after: a 3-page
  document reported 4.
- Measurement waits on `document.fonts.ready` and image loads. A page count
  measured before the webfont lands is confidently wrong.
- `content-visibility: auto` on each page — the content is duplicated per page,
  so a 40-page document would otherwise lay out 40 copies on every scroll.
- Verified by measurement in the browser pane: 88 lines, 3 pages, 35/35/18 line
  numbers, every painted number's Y matching its source line's midpoint to 0.0px.

### Resume bookmark → `ResumeMarker.svelte` (replaces `ResumeRibbon.svelte`)

- One element, `position: fixed` in the right margin. Never crosses the text.
- Tracks the anchor while it is on screen; pins to the nearer viewport edge with
  a ▲/▼ when it is not — which doubles as "scroll this way to get back".
- Dismiss is on the mark itself, so the thing you can see is the thing you can
  remove. The old design put the tag on the left and the pill on the right.
- **Auto-retires** once the reader is `RESUME_RETIRE_SCREENS` (1) viewport past
  it; that call goes through the same `onDismissResume` the ✕ uses.
- The `resumeRibbon` settings *key* is unchanged (persisted), only its label.
- Note the prop is `anchor`, not `state`: a local binding called `state` shadows
  the `$state` rune and svelte-check reports every use as a store subscription.

### Settings drawer, file sorting, and the descender bug

- Settings is a full-height right-hand drawer (≤560px) with a sticky header.
- `list_dir` now returns `modified` (ms epoch, `Option<u64>`); sorting is done in
  the frontend so switching order costs no disk read. Folders first in both
  orders; entries with no mtime sort last rather than pretending to be 1970.
- **The descender bug is worth remembering as a pattern:** `line-height: 1` on a
  box with `overflow: hidden` has nowhere to put a descender, so every p/y/g/j is
  sliced at the stem. It was in `.cm-item` (context menus), and the same shape
  was latent in both crumb trails. If you set `line-height: 1`, make sure
  nothing inside is clipping.

## What v0.8.0-nightly.2 added

### Tables wrap (`Viewer.svelte`, the `.table-scroll` block)

- `width: max-content` was the single line behind "why do I have to scroll a
  three-column table sideways". It asks for the width the table would take with
  no line breaking anywhere, which is the right answer for a table of file
  paths and the wrong one for a table of sentences. Now `width: 100%` with
  `table-layout: auto`, so columns are sized in proportion to their content.
- **`min-width: 7ch` on cells is what keeps the scroller meaningful.**
  `overflow-wrap: anywhere` lets any cell shrink to one glyph, so without a
  floor a twelve-column table would "fit" at four characters a column instead
  of scrolling. Measured: a 3-column prose table lays out 84/354/360px in an
  798px column with no overflow; a 12-column table overflows to 1008px and
  scrolls. Change one of these two rules and re-measure both cases.

### Hover-only scrollbars in the side panel

- Scoped to `.panel-stack`, **not** `.panel` — the Settings dialog uses
  `.panel` too.
- Only the thumb's colour is hidden. `scrollbar-width: none` would reflow the
  list every time the pointer entered the panel.
- The document scroller keeps its permanent bar deliberately: it is the one
  place the position information is worth the ink.

### Surface style: layered vs flat (`surfaceStyle` setting)

- Four chrome tokens, outermost first: `--titlebar-bg`, `--toolbar-bg`,
  `--side-bg`, `--chrome-bg` (the desk), then `--bg` (paper). In `flat` they
  collapse to one colour — byte-identical to v0.7. In `layered` each takes a
  2–4% step.
- **The rule, so future palette edits stay coherent: tone tracks distance from
  the document.** Paper is the extreme of the range; every surface further out
  steps back toward mid-grey. In light and sepia that is darker going outward,
  and in dark it is *also* darker going outward, because there the paper is the
  lightest thing on screen. One rule read in two directions.
- Applied via `html[data-surface]`, a separate axis from `data-theme`, so it is
  3 themes × 2 styles from one extra field. Specificity does the matching —
  `html[data-surface][data-theme=…]` (0,2,1) beats `html[data-theme=…]`
  (0,1,1) — so no `!important` and no dependence on source order.
- The Windows title bar reads `--titlebar-bg` now, not `--chrome-bg`. The
  effect must depend on `settings.s.surfaceStyle` or the caption colour goes
  stale when the style changes.
- `--toolbar-border` was a declared-but-unused token; it is now the toolbar's
  hairline, drawn as a `box-shadow` so flat mode keeps its exact 46px.

### Settings, sectioned

- Five headings (Appearance / Side panel / Reading / Editing / Advanced). The
  Smart-diff provider + API key fields moved inside Advanced and render only
  when `advancedLiveEditTheatre` is on — they configure nothing otherwise.

## What v0.8.0-nightly.1 added

Two complaints, one theme: the app was confidently showing something that was
no longer true.

### Refresh from disk

- `src/lib/refresh.svelte.ts` (`refresher`) is the single entry point. It calls
  `tabs.reloadAllFromDisk()` and then bumps a `tick` counter that
  `FileBrowser.svelte` watches, so the folder listing and the open tabs come
  back together. Surfaces: a toolbar button beside **File**,
  `Ctrl/⌘+R`, `F5`, File → Refresh from disk, the shell right-click menu, and
  the file-browser right-click menu — all one code path.
- **`Ctrl+R` and `F5` are `preventDefault`ed.** In a webview those mean "reload
  the page", which here would discard the whole session's tab state to achieve
  strictly less than refresh does.
- **Automatic sweep on `window.focus`**, coalesced at 400ms and silent (no
  spinner). This is the one that actually fixes the reported problem: the
  changes come from a terminal or an editor, so the moment you look back at Fox
  MD is the moment it is most likely to be stale.
- **Dirty tabs are skipped, unconditionally.** A refresh that could discard
  unsaved edits would be a worse bug than the staleness it fixes. Missing files
  are counted, not closed.
- **Why this exists at all — do not "simplify" it away:** `watcher.rs` arms on
  exactly *one* file, the active tab, and emits only that path. Background tabs,
  new files appearing in the open folder (the listing is read once, on entry),
  and every synced/virtual filesystem where `ReadDirectoryChangesW` is
  unreliable all fall straight through it. Extending the watcher to a *set* of
  files is the deeper fix and is still open; refresh is the escape hatch that
  works regardless. Torn-out windows are separate OS processes, so no refresh
  can cross windows — each one sweeps itself on focus, which is why the focus
  hook matters more than the button.

### The outline follows a reading line, not the top border

- `readingFraction()` in `Viewer.svelte` decides where in the viewport the
  "reading line" sits: **the middle**, ramping to the true top within the first
  half-screen of scrolling and to the true bottom within the last (documents
  shorter than two screens just get shorter ramps and no flat middle; nothing
  scrollable → the top). `publishNav()` probes the block/heading indexes at that
  line instead of `container.top + 12`.
- That single change fixes both halves of the complaint: with three sections on
  screen the one you are *looking at* is lit rather than the one touching the
  top border, and hitting the bottom of the document finally moves the mark to
  the last section — previously impossible for any final section shorter than
  the viewport, since it could never reach the top border.
- **Ramps, not snaps.** A hard "top edge below 50% scroll, middle above" rule
  would make the highlight jump a section on a one-pixel scroll. The ramp is
  monotonic and continuous end to end.
- The progress rail is now derived from the same reading line
  (`readY / scrollHeight`), so the bar and the lit entry cannot disagree.
- **`topOfViewport()` still exists and is still top-anchored** — it feeds
  `currentMark()`. Reading position is restored with `scrollBlockToTop`, so the
  mark must name the block that was at the top. Do not "unify" these two probes.
- `viewNav.topLine` was renamed `viewNav.readingLine`, because "top" had become
  actively wrong.

## What v0.7.0 added

Full detail in `CHANGELOG.md`; this is the orientation.

**The brief.** The owner's verdict on v0.6 was "95% there, but it still looks
developer-y — I want it to look general-consumer-y", with three specific
complaints: the side panel *"looks too similar to the text I'm reading"*, the
tab bar *"mixes too much with the text"*, and the toolbar showed a raw
`D:\...\file.md` path. Plus two feature asks (a fullscreen/focus button, and
right-click menus that mean something) and one platform ask (the black Windows
title bar should follow the app theme).

**The diagnosis, which is worth keeping.** The first two complaints were not
matters of taste and were not fixed by "more contrast":

- `--side-bg` and `--bg` were **the same colour in dark mode** (`#1c1c1e`). The
  panel *was* the document surface.
- The tab strip drew from `--muted-bg`, a token shared with in-document table
  headers. In dark mode that made it the brightest surface in the window.

The resolution is a **two-material model**: `--chrome-bg` for everything that
is not the document, and the document as a sheet floating on it (one rounded
corner, hairline ring, faint shadow). Light mode's tonal gap was *reduced*
(6.7% → 3.5%) and warmed — separation now comes from the edge, not the tone.
If you change one thing here, keep chrome tokens and document tokens
**separate**; merging them is what caused this.

**Architecture worth knowing:**

| File | Role |
|---|---|
| `src/lib/Icon.svelte` | The whole icon set, inlined Lucide-idiom geometry. Emoji are no longer used as UI anywhere. Stroke scales with size. |
| `src/lib/context-menu.svelte.ts` | Right-click menu store. `contextMenu.open(event, items)` — it calls `preventDefault()` for you. |
| `src/lib/ContextMenu.svelte` | The renderer. Mounted once, at the root of `+page.svelte`. Positions after measuring, hence the `.placed` class. |
| `src/lib/focus-mode.svelte.ts` | Focus mode state. Hides chrome **and** goes native-fullscreen; either alone is unsatisfying. |
| `src/lib/platform.ts` | `isMac`, `MOD`, `sk()` for shortcut labels, `copyText`, `revealInFileManager`. Every user-visible shortcut string goes through `sk()`. |
| `src/lib/Breadcrumb.svelte` | The document location. Elides from the left. |

**Two traps to not re-introduce:**

1. **`onMount` ordering in `+page.svelte` is load-bearing.** Local wiring
   (keyboard, context menu, drag-drop) is registered *before* the first
   `await`. It used to sit after a chain of Tauri calls, so one rejection
   silently removed every keyboard shortcut in the app. Do not move it back.
2. **`post-render.ts`'s table wrapper must copy `data-sourcepos`.** The Viewer
   indexes `.prose` children by that attribute; a wrapper without it drops
   every table out of scroll-restore, live-follow, diff mode and Theatre
   highlighting at once.

**Slug algorithm lives in two files** — `post-render.ts` (assigns ids) and
`outline.ts` (predicts them). They must stay byte-identical. Both now match
GitHub's, so `#anchor` links in hand-written tables of contents finally
resolve; the old `h-` prefix meant none of them ever did.

## What v0.6.0 added

The user's report, paraphrased: *"if one file is scrolled to the bottom and I
switch to another tab, that one has scrolled too — bad experience"*, plus a
list of side-panel and toolbar complaints, plus "audit the Live Edit Theatre".

### Reading position memory

- **Per-tab scroll positions.** The Viewer is a single long-lived instance
  shared by every tab, and it used to restore whatever `scrollTop` it last saw
  — which is exactly why tab A's offset appeared in tab B. It now keys off a
  `tabId` prop, flushes the outgoing tab's position before reading the
  incoming one, and explicitly starts unvisited documents at the top.
- **Cross-session resume.** Positions persist per file path in
  `settings.scrollMemory` (capped at 200, oldest evicted). Each mark stores
  *both* the source line of the top-most visible block and the scroll ratio:
  the line anchor survives font-size / zoom / content-width changes and edits
  below the reading position; the ratio is the fallback for when that block is
  gone.
- **The ribbon** (`src/lib/ResumeRibbon.svelte`) — a hairline accent rule with
  a "you left off here" tag, bright for ~5s then settling to `opacity: .38`.
  Once it scrolls out of view a marker appears in the right gutter to travel
  back. Both are pure presentation; the Viewer computes all geometry.
- Settings → Reading position controls cross-session persistence, the ribbon,
  and offers "Forget saved positions". **Per-tab retention is unconditional** —
  that's correct behaviour, not a feature to toggle.
- Writes are coalesced on a 600ms trailing timer and force-flushed on
  `beforeunload` / `pagehide` / visibility-hidden, so quitting right after
  scrolling doesn't lose the position.

### Outline scroll-spy + rework

- `src/lib/outline.ts` is the shared heading parser: ATX **and setext**
  headings, fence-aware, inline markdown stripped from labels, slugs deduped
  the same way `post-render.ts` assigns ids. Setext support matters because the
  renderer emits those as real `<h1>`/`<h2>` — missing them desynchronised the
  outline from the document.
- `src/lib/view-nav.svelte.ts` is the Viewer ↔ Outline bridge. **Source line
  numbers are the shared coordinate**, deliberately: comrak's `data-sourcepos`
  gives exact line ranges, whereas slug matching breaks on duplicate heading
  text. The Viewer publishes `activeLine` / `topLine` / `progress`; the outline
  calls `jumpToLine()`, which falls back to a slug lookup when no Viewer is
  mounted (edit mode).
- The duplicated "Outline" title — the panel section header *and* the outline
  component both drew one — is fixed.

### Side panel

- Whole-pane collapse (`settings.panelCollapsed`) with a single toolbar button,
  independent of which sections are enabled, so expanding restores what you
  had. `Ctrl+B` was rebound from "toggle Files" to this.
- Hover-peek on the window's left edge while collapsed
  (`settings.panelHoverPeek`), with a pin to dock it.
- Draggable Files/Outline split (`settings.panelSplit`) and an improved width
  resizer.

### Content width control

`src/lib/WidthControl.svelte` replaces the `86ch` badge with a miniature page
whose lines of text are as wide as the real content column. Driven by ‹ ›
buttons (8ch), horizontal drag, or the wheel; the number appears on hover only.
`role="slider"` with arrow/Home/End keys.

## Files worth knowing about

| File | Why it matters |
|---|---|
| `README.md` | User-first landing page. Screenshot placeholders still TODO (see `DEMO.md`). |
| `CHANGELOG.md` | Newest first. v0.6.0 → v0.5.1 → v0.5.0 → … |
| `HANDOVER.md` | **This file.** Keep it current. |
| `DEMO.md` | Recording playbook for README screenshots / hero GIF. Still not recorded. |
| `docs/` | The GitHub Pages landing site. `site-data.js` holds the copy and download links — **remember to bump the version there on every release**. |
| `docs/proposals/live-edit-theatre.md` | Design doc + locked decisions for Theatre. Read before touching that module. |
| `src/lib/Viewer.svelte` | Rendered HTML + scroll memory + scroll-spy + diff/theatre highlight painters. `.viewer` is `position: relative` — the ribbon and the live-follow maths depend on it being the offsetParent. |
| `src/lib/outline.ts` | Heading parser. Shared, and slug-compatible with `post-render.ts` — change both together. |
| `src/lib/view-nav.svelte.ts` | Viewer ↔ Outline bridge, source-line based. |
| `src/lib/ResumeRibbon.svelte` | "You left off here" ribbon + gutter marker. |
| `src/lib/WidthControl.svelte` | Visual content-width control. |
| `src/lib/LeftPanel.svelte` | Collapsible/peekable panel, both dividers. |
| `docs/DECISIONS.md` | **Why the product is shaped this way.** Add an entry in the same session as the work. |
| `docs/ROADMAP.md` | What is next, in order. The single task list. |
| `docs/MOBILE-PLAN.md` | Fox MD for Android — architecture, sync protocol, the QR answer. Planned, not started. |
| `src/lib/annotations/` | Highlights and threaded comments. See the v0.10 section above before touching it. |
| `src/lib/docx/` | Markdown → `.docx`. `parts.ts` and `WordPreview.svelte` encode the same format and must agree. |
| `src/lib/devmock.ts` | `?devmock=1` runs the real frontend against a fake Tauri backend. Add a handler when you add a command. |
| `src/lib/reading-metrics.svelte.ts` | Measured `ch` width and pane width, so the content-width ceiling follows the monitor. |
| `src/lib/settings-store.svelte.ts` | Settings schema + scroll-memory persistence. API keys are memory-only here; it migrates old plaintext values into the keyring and writes a marked fallback only after a genuine native-store failure. |
| `src-tauri/src/secrets.rs` | Allow-listed Groq/Anthropic get/set/delete commands backed by Windows Credential Manager, macOS Keychain or Linux Secret Service. Service stays `com.mdreader.app` across the rename. |
| `src/lib/tabs-store.svelte.ts` | Per-tab state: source, baseline, scroll/resume marks, theatre fields. `reloadAllFromDisk()` is the refresh path — it skips dirty tabs on purpose. |
| `src/lib/refresh.svelte.ts` | The refresh command (button / `Ctrl+R` / `F5` / window focus). Bumps `tick`; `FileBrowser` re-lists on it. |
| `src/lib/theatre/` | The Live Edit Theatre module. See breakdown below. |
| `.github/workflows/release.yml` | Tag push → 3-platform build → **draft** release (`prerelease: false`). Published manually. |

### src/lib/theatre/ module breakdown

```
src/lib/theatre/
  types.ts            — Turn, TheatrePhase, SelectedView, FreshRange
  diff-engine.ts      — diff-match-patch wrapper, heading-bounded section
                        splitter, changed-range computation
  store.svelte.ts     — per-tab state machine, ring buffer, fresh-range decay
  StatusBar.svelte    — bottom-left status during/after a turn
  ResumeChip.svelte   — floating chip to show/hide/clear highlights
  TipBanner.svelte    — one-shot discoverability tip for non-users
  DiffSidebar.svelte  — right panel: turn picker + per-section cards
  SidebarConnectors.svelte — SVG leader lines from paragraphs to cards
```

## Outstanding tasks

**Moved to `docs/ROADMAP.md`** — one list, kept in order, reviewed every
nightly. Keeping a second copy here is how the old one came to still list
"auto-update mechanism" after v0.9.0 shipped it.

Still true and not in the roadmap because they are chores, not features:

- **Enable GitHub Discussions** (Settings → General → Features). The
  issue-template `config.yml` already routes questions there.
- **Record demo assets.** Storyboards in `DEMO.md`. Hero GIF + 5 README
  screenshots are the minimum. Now that `?devmock=1` exists, these can be
  captured from a browser rather than an installed build.
- **Post the launch.** `LINKEDIN_POST.md` has the current drafts; update the
  product name and the stable link before posting.

## Known quirks / gotchas

- **Local `tauri build` requires `CARGO_BUILD_JOBS=2` on the user's Windows
  machine.** Parallel rustc workers exceed available RAM and get silently
  killed; cargo then reports a useless "failed to build app". CI is unaffected.
- **Stale `C:\` paths in `target/`.** The project moved from C: to D:. If a
  local build fails with `\\?\C:\...` errors: `cd src-tauri && cargo clean`.
- **Sibling Tauri project port collision.** `wispr-fox` uses 1420; md-reader
  is on 1430. Don't change back without checking.
- **HMR full-page-reload from state-store edits.** Editing
  `settings-store.svelte.ts` or `tabs-store.svelte.ts` triggers a full
  SvelteKit reload, which occasionally kills the WebView2 instance during dev.
  Just restart the dev session.
- **Theatre turn history is in-memory only, by design.** The file on disk is
  the source of truth; don't add sidecar files. Note this is *unlike* scroll
  positions, which are deliberately persisted — a reading position is the
  user's own state, not a derived artefact of the document.
- **Theatre triggers on ANY external edit**, not just AI. We don't fingerprint
  the writer. Documented behaviour.
- **Scroll marks are keyed by absolute file path.** Move or rename a file and
  its remembered position is orphaned (harmless — it just ages out of the
  200-entry cap).
- **`Ctrl+B` changed meaning in v0.6.0** (Files toggle → panel collapse). If a
  user reports "Ctrl+B stopped opening the file list", that's why; the 📁
  button does that job and also un-collapses the panel.

## Tech stack at a glance

- **Backend**: Tauri 2 + Rust. Markdown via `comrak` with syntect highlighting
  and `sourcepos` enabled (the frontend leans on it heavily — scroll anchors,
  scroll-spy, highlight painting, leader lines). File watching via
  `notify-debouncer-full` with an mtime poll fallback for cloud-drive paths.
  Windows-only `windows-sys` for `AllowSetForegroundWindow` (tab tear-out
  z-order).
- **Frontend**: SvelteKit (Svelte 5 runes) + Vite 6. Smart edit via
  `@milkdown/crepe`, raw edit via CodeMirror 6, math via KaTeX, diagrams via
  Mermaid, diff via `diff-match-patch`. Settings via `tauri-plugin-store`.
- **Build**: `npm run tauri dev` / `npm run tauri build`. `npm run check` for
  svelte-check — **it should report 0 errors, 0 warnings; keep it that way.**

## Useful commands

```bash
npm run tauri dev          # dev with HMR
npm run check              # svelte-check (must stay 0/0)
cargo check                # from src-tauri/ — the Rust gate
npm run build              # frontend-only production build
```

**Look at the UI without building an installer** — start the dev server (the
workspace `.claude/launch.json` has an `md-reader` entry on port 1430) and open:

```
http://localhost:1430/?devmock=1
```

**Verify a `.docx` export against Word itself.** A schema validator passes files
Word will not open, and Word is the thing that has to open it. From PowerShell,
with a file the app exported:

```powershell
$w = New-Object -ComObject Word.Application
$w.Visible = $false; $w.DisplayAlerts = 0
$doc = $w.Documents.Open("C:/path/to/export.docx", $false, $true)
"pages=$($doc.ComputeStatistics(2)) tables=$($doc.Tables.Count) lists=$($doc.Lists.Count)"
$doc.Paragraphs.Item(1).Style.NameLocal        # expect "Heading 1"
$doc.Paragraphs.Item(1).Borders.Item(-3).LineStyle   # expect 1 (the rule)
$doc.Close($false); $w.Quit()
```

**Cut a release**

```bash
# Nightly — publishes as a pre-release, which the in-app updater can see
git tag v0.X.Y-nightly.N && git push origin v0.X.Y-nightly.N

# Stable — lands as a draft so the notes can be written first
git tag v0.X.Y && git push origin v0.X.Y
gh release edit v0.X.Y --draft=false --latest --notes-file notes.md
```

Bump the version in **three** places before tagging: `package.json`,
`src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`. And on a stable, bump
`docs/site-data.js` — the landing page's download links are version-pinned.

---

If you are a Claude session picking this up cold: read this file, then
`docs/DECISIONS.md` for why, then `docs/ROADMAP.md` for what is next. Then ask
the user which roadmap item they want — do not guess.
