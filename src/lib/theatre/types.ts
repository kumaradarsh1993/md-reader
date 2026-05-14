/**
 * Shared types for the Live Edit Theatre feature. See
 * `docs/proposals/live-edit-theatre.md` for the full design rationale.
 */

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
  /** Lazily populated when the user requests an LLM summary in the sidebar. */
  llmSummary?: string;
  /** Set true while llmSummary is being fetched. */
  llmLoading?: boolean;
  /** Surfaced if the LLM call failed. */
  llmError?: string;
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
