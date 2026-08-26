# Fox MD for Android — plan

**Status: planned, not started.** Written 2026-08-26 so the build starts from
settled decisions rather than from a blank Gradle project.

Target folder: `md-reader-android/` in the workspace, matching how
`wispr-fox` / `wispr-fox-android` are named. Kotlin + Jetpack Compose, sideloaded
(no Play Store), built by GitHub Actions on a tag — the same shape as
`wispr-fox-android`, which is the working precedent on this machine.

---

## 1. What the app is for

Not "a markdown viewer for Android". The brief, in the owner's words:

> *"sometimes I'm reading stuff on my laptop and doing stuff on my laptop and I
> do a lot of knowledge work. But then I have to quickly move to my mobile
> phone… I got up from my laptop and I never bothered about anything, I opened
> my phone and quickly went to the app and opened it up."*

So the product is **continuation**. The reader is table stakes; the feature that
justifies the app is that the document you were just reading is already listed
when you open it, with no export, no transfer, and no thinking about files.

Everything below is ordered by that. A beautiful reader that still requires you
to email yourself a file has missed the point.

---

## 2. Non-negotiables carried over from the desktop

- **The screen is for the document.** No persistent chrome. Controls appear on a
  tap and leave again.
- **Landscape is a first-class orientation**, not a rotated phone layout —
  landscape is where a two-column-width document actually reads well, and it is
  the orientation that matches the desktop's proportions.
- **Font size and characters-per-line are both adjustable**, and they are two
  different things. This is the distinction the desktop app was built around and
  the reason it exists at all.
- **Highlights and comments work the same way**, on the same files, in the same
  sidecar format.
- **Nothing is lost by closing the app.** Notes autosave; reading position is
  remembered per document.

---

## 3. Milestones

### M1 — Reader

Open a `.md` and read it well. Shippable on its own.

- Register as a handler for `text/markdown` and `.md` / `.markdown` files, so
  markdown opens here from any file manager, mail client or chat app.
- Storage Access Framework for opening files and folders; no legacy storage
  permission, no scoped-storage fight.
- **Rendering.** Two options, and this is the one real technical fork:
  - **A native Compose renderer** — parse with a Kotlin markdown library
    (`jetbrains/markdown` is the sane choice) and emit `AnnotatedString` +
    composables. Best scrolling, best text selection integration, most work,
    and it will diverge from comrak's output in edge cases.
  - **A `WebView` rendering the same HTML the desktop produces.** Guarantees the
    two apps look identical, and lets the annotation anchoring code — which is
    written against a DOM and `data-sourcepos` — be *shared verbatim* rather
    than reimplemented.
  - **Decision: WebView.** The deciding factor is not rendering quality, it is
    that annotation anchoring, highlight painting and the comment lane are
    ~800 lines of already-verified DOM code. Reimplementing them natively means
    two implementations of a subtle algorithm that must agree on where a note
    points, forever. The markdown → HTML step runs in Kotlin (`jetbrains/markdown`
    with GFM extensions) and must emit `data-sourcepos` to match comrak.
    ⚠️ **Verify early:** WebView's `CSS.highlights` support. Android System
    WebView is Chromium and has had it since 105, but the annotation layer
    depends on it, so check on a real device before building on it.
- **Gestures**: pinch to change text size; a two-finger horizontal pinch (or a
  drag on an edge control) for line width. Both persist per device, not per
  document.
- Themes: light / sepia / dark, following the desktop's tokens exactly.
- Reading position remembered per document.

### M2 — Annotations

- Long-press to select, then the same five-colour bar plus **Comment**.
- The comment lane becomes a **bottom sheet** on a phone: markers stay in the
  right margin, tapping one raises a sheet with the thread. In landscape and on
  a tablet the desktop's reserved-lane layout works as-is.
- **Reads and writes the identical `.foxmd/<name>.notes.json` format.** A note
  made on the phone appears on the desktop as soon as the folder syncs, because
  it is the same file. This is why the format is on disk beside the document and
  not in a database.

### M3 — Handover *(the reason the app exists)*

See §4 for the protocol. In the app it is one screen: **Open on my devices**,
grouped by device name, each device's tabs in tab order, most recently active
first. Tap a document and read it. A pull-to-refresh asks the desktop for a
fresh copy if it is awake, and falls back to the last synced copy if it is not.

### M4 — Read aloud

The phone is where narration is actually used. See the Narration section of
`ROADMAP.md`: for walking and driving the right object is a **pre-rendered audio
file with chapter marks at the headings**, played through `MediaSession` so
lock-screen and car Bluetooth controls work, not streaming TTS that stalls when
the signal drops.

---

## 4. Handover — how a document reaches the phone

### Auth: one account, shared with wispr-fox

The owner explicitly asked for unified login. `wispr-fox` already has a Supabase
project with `auth.users`, a `devices` table (`id`, `user_id`, `name`,
`platform`, `last_seen_at`) and a generic `user_settings` key/value table, all
under row-level security keyed on `auth.uid() = user_id`.

**Decision: reuse that project rather than creating a second one.** Signing in
once covers both products, `devices` is already exactly the table "which of my
machines has this open" needs, and it costs no account setup. Fox MD adds its own
tables with an `md_` prefix and its own `fox_md_access` app-metadata guard,
mirroring wispr-fox's existing `wispr_fox_access` pattern.

⚠️ **Every insert must carry `user_id`.** Omitting it fails the NOT NULL and the
RLS check at once, and on wispr-fox's desktop that surfaced as a misleading
"Sync paused — will retry" banner rather than an error. Do not repeat that.

### Schema (proposed)

```sql
-- One row per document a device currently has open.
create table public.md_open_tabs (
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   uuid not null references public.devices(id) on delete cascade,
  doc_id      text not null,          -- stable hash of the absolute path
  path        text not null,          -- shown as a subtitle, never resolved
  title       text not null,
  tab_index   int  not null default 0,
  is_active   boolean not null default false,
  content     text not null,          -- the markdown itself
  notes_json  text,                   -- the .foxmd sidecar, if any
  size_bytes  int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, device_id, doc_id)
);
```

**The document content lives in the row.** Markdown is small — a ten-page
document is 20–40KB — so a separate object store would be machinery for nothing.
Cap it (**256KB**) and, above the cap, sync the metadata only and mark the row
`oversize`; the phone then shows the entry and says it is too large to carry,
which is honest and rare.

### The protocol

- **Desktop pushes** on tab open, on save, and on external change, debounced to
  ~2s. Closing a tab deletes the row — the list is "what is open now", so a
  stale entry is worse than a missing one.
- **Phone reads** `md_open_tabs` for the user, joined to `devices` for the name
  and `last_seen_at`.
- **Pull-to-refresh**: if the desktop was seen in the last few minutes, the phone
  writes a refresh request into `user_settings` (or a Realtime broadcast) and
  waits briefly; the desktop re-pushes. If not, the last synced copy is used and
  the age is shown — "as of 14 minutes ago" is a fact worth stating rather than
  a silent staleness.
- **Locally cached** on the phone in app-private storage, with a TTL, so a
  document you pulled is readable in a lift with no signal.
- **Notes made on the phone go back the same way** and land in the desktop's
  real `.foxmd/` folder on next sync.

### On the QR code idea

Asked directly: *how much data can a QR code hold — could it carry a 5–10 page
document?*

**No.** The absolute maximum for any QR code is version 40 at the lowest error
correction: **2,953 bytes** of binary data (4,296 alphanumeric characters). A
five-page markdown document is roughly 10–15KB and a ten-page one 25–40KB.
Gzipping and base64-ing 15KB still lands around 4–5KB — comfortably over the
limit, and a version-40 code at that density is already hard for a phone camera
to read off a laptop screen.

Chunking across an animated sequence of codes works and is a real technique, but
as the *primary* transfer path it means holding a phone steady at a screen for
several seconds and starting again on any misread.

**What a QR code is genuinely good for here is pairing.** A short-lived signed
token — well under 200 bytes — displayed on the desktop, scanned once, signing
the phone into the same account. That is the right use, and it removes the only
annoying part of the account flow (typing a password on a phone). Worth building
in M3; not worth building as a document transfer.

---

## 5. Toolchain notes for this machine

Verified in the workspace `CLAUDE.md`, and load-bearing:

- **Two JDKs.** `D:\android-dev\jdk` is 17 (wispr-fox-android);
  `D:\android-dev\jdk21` is 21 (MoneyFox). Pick deliberately and set
  `JAVA_HOME` per invocation — it is not set globally.
- SDK at `D:\android-dev\sdk`, platform 36 + build-tools 36.0.0 present.
- `local.properties` (`sdk.dir`) is gitignored and per-machine. Set it after any
  fresh clone.
- ⚠️ **Never hand a Windows path to a `.bat` from Git Bash.** MSYS mangles it:
  `--sdk_root=D:\android-dev\sdk` silently created a literal `android-devsdk\`
  directory during the MoneyFox SDK install, and reported success. Use
  PowerShell for anything touching the Android tooling.
- Local gate:
  `$env:JAVA_HOME="D:\android-dev\jdk21"; .\gradlew.bat testDebugUnitTest`
- Release: tag → GitHub Actions → APK, with signing secrets already configured
  for the sibling project as the model.
