# Proposal: Live Edit Theatre + Diff Tracker

> Status: **Draft** — design under debate, not yet implementing.
> Author: AI session 2026-05-13, in collaboration with the project owner.
> Target release: probably **v0.4.0**, after the v0.3.0 basics-cleanup release.

## TL;DR

Make the existing "watch AI write to a markdown file" capability the **standout feature** of the product. Two interlinked sub-features:

1. **Live Edit Theatre** — when external edits are detected on the active file, the viewer smoothly zooms out, shows a status bar, highlights changed regions in yellow, and tracks the AI's "cursor" without yanking the user. When edits stop, a "Dismiss / Resume where I was" affordance returns the user to their original zoom and position. Highlights persist via a toggle.
2. **Diff Tracker sidebar** — a Word-comments-style right panel (toggleable) that lists every changed segment in the current session, with either a naive red/green diff or an LLM-summarised "what changed and why" view.

Both live behind a new **Advanced features** section in Settings, off by default. The current toolbar `📡 Track` and `🔍 Diff` buttons disappear entirely — they're replaced by this richer module, contextually surfaced only when AI editing is detected.

---

## Why this is worth building

- **No competitor does this.** Typora is a passive viewer. Obsidian's diff-on-save is for git workflows, not live AI editing. VS Code has no notion of "an AI is currently writing this file." Cursor's diff UI is per-edit, not per-document. This is an empty quadrant.
- **It fits the existing positioning.** "md-reader is the viewer for AI-generated markdown" — Theatre makes that explicit and dramatic instead of subtle.
- **The user research is real.** The current `liveTrack` + `diffMode` UX kept getting in the way (toolbar clutter, over-scroll, no clear "we're done editing" signal). The fix isn't to remove them — it's to repackage them as one cohesive *experience* gated behind opt-in.
- **It does not break the lightweight promise.** The theatre animations are CSS transforms (free). The diff calculation is `diff-match-patch` (kilobytes, microsecond runs). The LLM summary is an explicit user action (opt-in API key). Total bundle delta: probably < 30 KB.

## Why split into two phases

The basics cleanup (tab z-order, toolbar polish, About dialog, settings cleanup) is independent and well-defined. The theatre work needs prototyping iteration. Don't block one on the other.

| Phase | Version | Scope | Effort |
|---|---|---|---|
| **A** | v0.3.0 | Tab z-order fix; toolbar redesign (width vs zoom separation, bigger settings cog); About dialog; settings cleanup; **remove toolbar buttons for Track/Diff entirely**; relocate them to a temporary "Advanced features" toggle in Settings (off by default, keeps existing behaviour available for power users until Phase B lands) | ~1 day |
| **B** | v0.4.0 | Live Edit Theatre + Diff Tracker sidebar + LLM-summary diff. This proposal. | ~3-5 days |

---

## Phase B design

### The Theatre interaction (storyboard)

```
[ Normal state ]
  User is reading or editing a file.
  Zoom = 100%, content width = user's preference.
  No status bar.

         ↓ (external file change detected; debounce window = 8s of activity)

[ Theatre engaged ]
  Background: subtle desaturation + 4% dim around the .prose column.
  Zoom: smooth animate to ~75% (configurable: 60-90%).
  Content width: unchanged.
  Status bar appears bottom-left, slide-in:
    "🎬 AI editing — 3 changes so far · pause to dismiss"
  Each new edit:
    - Region pulses briefly (existing live-edit-flash)
    - Stays accented in yellow (existing live-tracked, persistent)
    - Viewport auto-scrolls to bring the edit into the lower-third of view
      (NOT centered — that's where over-scroll comes from)
    - If user scrolls manually, lock to user's position until next 5s of no edits

         ↓ (5s of no new external edits)

[ Edits done ]
  Status bar morphs:
    "✅ 12 changes highlighted · [Dismiss] [Show summary →]"
  Theatre stays engaged — user can scroll around, look at highlights.

         ↓ (user clicks Dismiss)

[ Resume state ]
  Smooth zoom back to 100%.
  Background returns to normal.
  Status bar slides out, replaced by a small floating chip top-right:
    "[✓] Show changes · ✕"
  - Toggle: hide/show the yellow highlights without losing them.
  - ✕: clear the highlights entirely, baseline becomes "now".

         ↓ (user presses ✕ or starts a new edit session)

[ Back to normal state ]
```

### The Diff Tracker sidebar

A right-side panel, mirror image of the existing left side panel. Toggleable via:
- A sticky vertical strip on the right edge ("📋 Changes" button)
- `Ctrl + Shift + D`
- Auto-opens when the user clicks "Show summary →" in the post-edit status bar

Inside the panel, one card per changed section:

```
┌──────────────────────────────────┐
│ ## Background                    │ ← heading anchor, click → scroll to section
│ ───                              │
│ 3 lines changed                  │
│ ▾ View diff                      │ ← inline expand
│                                  │
│ [Naive ▼]  ← mode toggle         │
│                                  │
│ - Old: This project started in   │
│   April 2026 as a side bet.      │
│ + New: This project started as a │
│   weekend experiment in April    │
│   2026 to bridge a gap in AI-    │
│   markdown tooling.              │
└──────────────────────────────────┘
```

**Two modes per card:**

- **Naive (default)**: red strikethrough for removed, green underline for added. Library: [`diff-match-patch`](https://github.com/google/diff-match-patch) — ~30 KB minified, well-tested. Renders client-side, no network.
- **LLM summary**: prose summary of what changed and the intent. *"This section was reframed from a personal project history to an industry-positioning narrative."* Requires an API key (any of: Anthropic, Grok free tier, Gemini, OpenAI). Settings field added per-provider.

**Mode toggle is per-card** so you can quickly LLM-summarise the one paragraph you care about without burning tokens on the whole document.

### State machine

```
NORMAL ───[edit detected]──→ ENGAGING ───[zoom animation done]──→ ENGAGED
                                                                     │
                                                              [edit arrives]
                                                                     │
                                                                     ↓
                                                                  ENGAGED
                                                                     │
                                                              [5s idle]
                                                                     │
                                                                     ↓
                                                                   DONE
                                                                     │
                                                              [user dismisses]
                                                                     │
                                                                     ↓
                                                                RESUMING ───[zoom animation done]──→ HIGHLIGHTED
                                                                                                          │
                                                                                                  [user clears highlights]
                                                                                                          │
                                                                                                          ↓
                                                                                                       NORMAL
```

### Settings model

Replace the current `experimentalLiveTrack` / `experimentalDiffMode` with one cohesive section:

```
Advanced features
  ☐ Live Edit Theatre
    When enabled, md-reader detects when an AI is editing the open
    file and switches to a cinematic view. See changes highlighted,
    auto-scroll to follow edits, then resume where you were.

    ▸ Diff sidebar:        [ Show on dismiss ▾ ]
                            options: Always open / Show on dismiss / Manual only
    ▸ Theatre zoom level:  [ 75% ▾ ]    options: 60% / 75% / 90%
    ▸ Edits-done debounce: [ 5s ▾ ]     options: 3s / 5s / 10s
    ▸ LLM diff summary:    [ ☐ Enabled ]
        Provider: [ Anthropic ▾ ]   options: Anthropic / Grok / Gemini / OpenAI
        API key:  [ sk-... ]
```

Everything off by default. The toolbar Track/Diff buttons go away in Phase A.

### What gets removed

- `📡 Track` toolbar button — gone.
- `🔍 Diff` toolbar button — gone.
- `✨ Why?` summary action — replaced by per-card LLM summary in the sidebar.
- `Ctrl + L` and `Ctrl + D` shortcuts — removed (replaced by `Ctrl + Shift + D` for sidebar toggle).
- The current `editingPulse` "📡 live" middle-of-toolbar badge — replaced by the bottom-left theatre status bar.

### What gets added

- `src/lib/theatre/Theatre.svelte` — wraps Viewer, handles zoom transform + status bar.
- `src/lib/theatre/edit-detector.ts` — debounce + state machine.
- `src/lib/theatre/diff-sidebar.svelte` — right-side panel.
- `src/lib/theatre/diff-engine.ts` — `diff-match-patch` wrapper + LLM-summary client.
- New CSS var `--theatre-bg` for the desaturated background.
- New keyboard shortcut: `Ctrl + Shift + D` for sidebar toggle.

### File paths likely to touch

- `src/routes/+page.svelte` — wire the Theatre wrapper into the body
- `src/lib/Viewer.svelte` — strip current `liveTrack` / `live-edit-flash` / `live-tracked` logic; the theatre takes over
- `src/lib/settings-store.svelte.ts` — new schema fields, migrate old experimental flags
- `src/lib/Settings.svelte` — new "Advanced features" section
- `src/lib/tabs-store.svelte.ts` — extend `baselineSource` to also track "theatre session baseline" (separate from "file opened baseline")
- `src/lib/smart-diff.ts` — repackage as the LLM-summary backend for the sidebar

---

## Open questions (need user decision)

1. **Theatre opt-in: silent vs prompted?** First time an external edit arrives, do we auto-enter theatre (assuming the setting is on), or show a one-time "AI editing detected — enter theatre? [Yes] [Not now] [Don't ask again]" prompt?
2. **What happens if the user is in *Smart edit* mode and external edits arrive?** Options: (a) refuse external updates while dirty (current behaviour); (b) prompt "Claude is editing — reload?"; (c) auto-merge (hard); (d) flip to view mode and enter theatre. I lean (b) — least surprising.
3. **Versioning depth: just 1-step, or N-step history?** 1-step is "current vs session baseline". N-step would be "compare any two snapshots in this session." Recommend 1-step in v0.4, defer N-step to v0.5 if there's demand.
4. **OneDrive conflict semantics**: if OneDrive overwrites the file mid-theatre (sync from another machine), what wins? Recommend: detect the overwrite, exit theatre, show a "File was synced from elsewhere" toast. Don't try to be cleverer.
5. **Discoverability for users who haven't enabled Advanced features**: when an external edit happens to a user with Theatre disabled, do we surface a one-time "Did you know? Enable Live Edit Theatre to watch AI edits in cinema view → Settings" tip? I'd say yes — it's how people learn the feature exists.
6. **LLM summary quality bar.** Grok free tier and Gemini free tier vary in quality. Should we benchmark a few standard "section was rewritten" prompts to ensure the summary is useful before shipping? I'd say yes — a bad LLM diff is worse than no diff (looks lazy).
7. **Multi-file sessions**: if the user has 4 tabs open and Claude is writing to 2 of them, do they each get independent theatre states? Or one global "theatre is engaged" state? Recommend per-tab (cleaner, lets you ignore one while watching the other).
8. **Telemetry**: the product principle is no telemetry. Do we want to add an opt-in "share usage data" toggle just to learn whether anyone uses theatre? I'd say no — keep the privacy stance pure, measure usage by feedback only.

---

## Risks / trade-offs

- **Animation jank on low-end machines.** Smooth zoom from 100→75% on a 10,000-line document, done badly, looks awful. Mitigation: only animate the *outer container*, not the prose itself (which is laid out once). CSS `transform: scale()` is GPU-accelerated. Pre-test on the user's lowest-spec target.
- **`diff-match-patch` on huge files** (think a 500-line plan, then Claude rewrites half of it). The library is fast (single-digit ms for ~50 KB inputs) but render of many highlight spans could lag. Mitigation: cap to top-N changed sections in the sidebar, link to "view more" for the rest.
- **LLM API key UX.** Adding a *provider picker* is a UX burden for a feature most users won't enable. Mitigation: ship with just Anthropic in v0.4 (reuse the existing key) and add other providers in a follow-up if there's demand.
- **The current liveTrack/diffMode users.** Existing users with these flags on will lose the toolbar buttons. Mitigation: a one-shot "We've moved this — find it in Settings → Advanced" toast on first run after upgrade.

---

## Effort estimate

- **Phase A (v0.3.0 — the basics):** ~1 day focused.
  - Tab z-order fix (need to investigate the win32 ordering of spawned-process windows): 2-3h
  - Toolbar redesign (visual spacing of width vs zoom controls, settings cog enlargement, vertical rhythm pass): 2h
  - About dialog: 1h (read version from `package.json` at build time, simple modal)
  - Settings cleanup + remove Track/Diff toolbar buttons + relocate to Advanced: 2h
- **Phase B (v0.4.0 — the theatre):** ~3-5 days focused.
  - Edit detector + state machine: ~1 day
  - Theatre wrapper component with zoom/desaturate transforms: ~1 day
  - Status bar + resume chip: ~half-day
  - Diff sidebar with naive mode (`diff-match-patch`): ~1 day
  - LLM summary mode: ~half-day
  - Polish + edge cases: ~half-day

Total to ship both: roughly **one focused week**, two if interruptions.

---

## Recommendation

Ship Phase A first as a quick v0.3.0 cleanup. It addresses 80% of the user-reported pain (toolbar clutter, missing About, tab z-order) with low risk. While that's in users' hands and gathering feedback, design and prototype Phase B as v0.4.0.

If the user agrees with this split: next steps are to write up Phase A as a short scoped plan and start implementation. Phase B stays in this doc, gets iterated on, gets a "Decision needed" answer for each of the 8 open questions above, then becomes its own scoped plan.

---

## Locked decisions (2026-05-13 debate)

After back-and-forth on the versioning model, here's what's locked:

### Detection model (resolves: "how do we know AI vs human?")

We **do not distinguish** AI edits from any other external edit. The signal is simply: "file changed on disk while md-reader is open." Whatever wrote to the file (Claude, Cursor, another editor, a script, OneDrive sync) is treated identically. No fingerprinting, no fake intelligence. Honest and reliable.

Theatre only engages when md-reader is in **view** or **rawEdit** mode. If the user is in **smart edit** mode and an external change arrives, we follow current behaviour (ignore while dirty; reload while clean) — no theatre. Trying to merge AI edits with active user editing is out of scope.

### Turn history model (resolves: "where do previous AI turns go?")

A **ring buffer of the last 10 turns**, in-memory only, per open tab:

```ts
type Turn = {
  id: number;                  // monotonic per tab
  startedAt: number;           // first change detected
  finishedAt: number;          // 5s of idle after last change
  snapshotBefore: string;      // file state when turn started
  snapshotAfter: string;       // file state when turn ended
  changedRanges: Range[];      // computed once, cached
  llmSummary?: string;         // populated lazily on user request
};

// tabs-store.svelte.ts gains:
type Tab = {
  // ... existing fields
  turns: Turn[];               // capped at 10, oldest evicted
  selectedTurnId: number | null;  // which turn the sidebar is showing
};
```

Lost on app close. The file on disk is the source of truth. md-reader is a *viewer of changes*, not a version control system — no branching, merging, or restore.

### Overlap semantics (resolves: "v1 and v2 both changed line 50")

**Snapshot-based, not cumulative.** Selecting `v1` in the sidebar dropdown renders the diff of `v1.snapshotBefore → v1.snapshotAfter`, frozen as it was at v1's completion. v2's later changes to the same line don't affect v1's view — each turn is its own artefact.

A separate dropdown option, **"Since file opened"**, gives the cumulative view (current state vs the file as it was when this tab opened).

### Sidebar UX (locked)

```
┌─ Changes ─────────────────────────────────────┐
│                                                │
│  Show changes from: [v3 — 2 min ago ▾]         │
│  ──────────────────────────                    │
│    v3 — 2 min ago                              │
│    v2 — 8 min ago                              │
│    v1 — 22 min ago                             │
│    ──                                          │
│    Since file opened                           │
│                                                │
│  ─────────────────────────────────────────     │
│                                                │
│  Section: ## Background                        │
│  3 lines changed                               │
│  [Naive ▼] [✨ LLM summary]                    │
│                                                │
│  - Old: This project started in April          │
│    2026 as a side bet.                         │
│  + New: This project started as a weekend      │
│    experiment in April 2026 to bridge a gap    │
│    in AI-markdown tooling.                     │
│                                                │
│  ─────────────────────────────────────────     │
│                                                │
│  Section: ## Why this matters                  │
│  …                                             │
└────────────────────────────────────────────────┘
```

### Memory + performance bounds (resolves: "lightweight concern")

- Per file: 2 snapshots × 10 turns × avg 50 KB = **1 MB ceiling per tab**
- 5 active tabs: **5 MB ceiling total** — negligible
- Snapshot cost: ~1 ms (string copy)
- Diff cost: ~5 ms for 50 KB via diff-match-patch
- Bundle delta: ~30 KB (diff-match-patch only)
- Zero disk writes, zero sidecar files
- App startup unchanged (history empty on open)

### Opt-in model (resolves: "niche feature")

The whole Theatre + Diff system lives behind `settings.advanced.liveEditTheatre`, **off by default**. Toolbar buttons removed entirely; nothing happens for users who haven't opted in. They get a quieter app than today (since current Track/Diff buttons are also being removed in Phase A).

For users who opt in: a small `🎬 AI editing` badge appears in the toolbar *only when* an external edit is currently happening; status bar bottom-left during a turn; sidebar via `Ctrl+Shift+D` once highlights exist.

### Toolbar exposure for non-opt-in users

When external edits arrive to a user who hasn't enabled Theatre, we surface **one** subtle one-time tip: a small inline banner "Did you know? Enable Live Edit Theatre to watch AI edits in cinema view → Settings". Dismissible; won't appear again. This is how the feature gets discovered.

## Status log

- **2026-05-13 (draft)**: Initial proposal written.
- **2026-05-13 (debated)**: Versioning model debated and locked. Snapshot-based ring buffer of 10 turns per tab, in-memory, lost on close. Detection = disk-watcher only, no AI fingerprinting. Sidebar shows per-turn frozen diffs + a "Since file opened" cumulative option. Memory ceiling ~1 MB per tab, bundle delta ~30 KB. **Ready to implement.**
