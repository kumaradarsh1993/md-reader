/**
 * Shared types for the Live Edit Theatre feature. See
 * `docs/proposals/live-edit-theatre.md` for the full design rationale.
 */

/** Sidebar per-card state for the lazily-fetched LLM summary of one section. */
export interface CardSummaryState {
  /** Prose summary, once fetched successfully. */
  summary?: string;
  /** True while the request is in flight. */
  loading?: boolean;
  /** Surfaced if the LLM call failed (or a friendlier pre-flight message). */
  error?: string;
}

/** One Claude/AI turn — a contiguous burst of external edits to the file. */
export interface Turn {
  /** Monotonic ID, unique within a tab's session. */
  id: number;
  /** Wall-clock ms when the first edit of the burst arrived. */
  startedAt: number;
  /** Wall-clock ms when the idle debounce fired, finalising the turn. */
  finishedAt: number;
  /** Source content immediately before this turn started. Frozen artefact. */
  snapshotBefore: string;
  /** Source content when the turn was finalised. Frozen artefact. */
  snapshotAfter: string;
  /**
   * Per-section LLM summary cache, keyed by the section's index within this
   * turn's `changedSections()` output (stable across re-renders because
   * snapshotBefore/After are frozen, so the section list never reshuffles).
   * Lives on the Turn — not on the DiffSidebar component — because the
   * sidebar unmounts whenever `sidebarOpen` flips false, and we don't want
   * to lose fetched summaries (or re-bill the API) on every close/reopen.
   */
  cardSummaries?: Record<number, CardSummaryState>;
  /**
   * Per-section display mode (naive diff vs LLM summary), keyed the same way
   * as `cardSummaries`. Sticky across sidebar close/reopen for the same
   * reason — otherwise every card silently reverts to "Naive diff" the
   * moment you close the panel.
   */
  cardMode?: Record<number, "naive" | "llm">;
}

/**
 * State machine for a single tab's theatre session.
 *
 *    off ──[edit detected]──▶ engaging ──[zoom anim]──▶ engaged
 *                                                          │
 *                                                  [more edits keep
 *                                                   resetting idle timer]
 *                                                          │
 *                                                  [5s idle]──▶ done
 *                                                          │
 *                                                  [user dismisses]
 *                                                          │
 *                                                  ──▶ resuming ──[zoom anim]──▶ off
 *                                                                                 │
 *                                                                  (highlights persist
 *                                                                   if user hasn't
 *                                                                   cleared them)
 */
export type TheatrePhase =
  | "off"
  | "engaging"
  | "engaged"
  | "done"
  | "resuming";

/**
 * A line range marked as "freshly edited in the last tick", with a timestamp
 * so the decay loop can promote it to the regular (stale/yellow) set after
 * the configured idle threshold.
 *
 * v0.5.0+: replaces the binary "this turn changed it" model with a two-phase
 * model — fresh (green, currently being edited) → stale (yellow, edited in
 * this turn but not in the last ~1.5s).
 */
export interface FreshRange {
  from: number;
  to: number;
  touchedAt: number;
}

/**
 * Which "view" the diff sidebar is showing.
 *  - A turn ID: show that frozen turn's before→after diff
 *  - "since-open": show current source vs baselineSource (cumulative view)
 *  - "live": show current source vs the in-flight turn's snapshotBefore
 *    (only meaningful while phase === "engaged" or "done" with no selection)
 */
export type SelectedView = number | "since-open" | "live";
