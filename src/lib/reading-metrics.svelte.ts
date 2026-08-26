/**
 * Live measurements of the reading column, published by the Viewer and read by
 * every control that offers to change its width.
 *
 * ## Why this exists (v0.10.0)
 *
 * Content width was capped at a hard `WIDTH_MAX = 160` characters. On a laptop
 * panel that ceiling is unreachable anyway, so nobody noticed. On a 27" external
 * monitor with the window at ~70% width it becomes a *visible* wall: the column
 * stops widening while there is still an inch of empty paper either side, and
 * the only way to fill the window is the all-or-nothing "full width" toggle.
 *
 * The fix is not a bigger constant — a bigger constant is the same wall moved.
 * The ceiling is now **whatever actually fits the pane you are reading in**,
 * measured, with the old 160 kept as a *floor* so nothing regresses on a small
 * screen. Widen the window and the slider gains room; narrow it and the setting
 * is clamped down to what is real.
 *
 * `chPx` is measured rather than derived because a `ch` is the advance width of
 * the digit zero in the *current* font at the *current* zoom — it moves when
 * either does, and guessing it wrong is what makes a "characters per line"
 * number a lie.
 */

/** Absolute floor for the ceiling: a small window still offers the old range. */
export const WIDTH_CEILING_FLOOR = 160;
/** Absolute ceiling for the ceiling. Past this the measure is not a measure. */
export const WIDTH_CEILING_CAP = 400;

class ReadingMetrics {
  /** Measured px width of one `ch` at the current font family / size / zoom. */
  chPx = $state(8);
  /** Px available to the text itself — the pane, less both gutters. */
  availablePx = $state(760);

  /**
   * The largest `contentWidthCh` that still fits without the column being
   * clamped by the pane. Clamped by the column being clamped is exactly the
   * state to avoid: past this point the number in the UI stops describing the
   * line length, and collapsing the side panel starts reflowing the text
   * instead of just re-centering it.
   */
  get maxCh(): number {
    if (this.chPx <= 0) return WIDTH_CEILING_FLOOR;
    const fits = Math.floor(this.availablePx / this.chPx);
    return Math.min(WIDTH_CEILING_CAP, Math.max(WIDTH_CEILING_FLOOR, fits));
  }

  /** True when the current pane genuinely offers more than the old 160 cap. */
  get roomier(): boolean {
    return this.maxCh > WIDTH_CEILING_FLOOR;
  }

  publish(chPx: number, availablePx: number) {
    // Guard against a measurement taken before fonts/layout settle: a zero or
    // absurd `ch` would collapse the ceiling to the floor and silently clamp
    // the user's saved setting down.
    if (chPx > 0.5 && Number.isFinite(chPx)) this.chPx = chPx;
    if (availablePx > 0 && Number.isFinite(availablePx)) this.availablePx = availablePx;
  }
}

export const readingMetrics = new ReadingMetrics();
