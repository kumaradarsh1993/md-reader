/**
 * Bridge between the rendered document (Viewer) and the chrome around it
 * (Outline panel).
 *
 * The Viewer owns the scroll container and the rendered DOM; the Outline is
 * derived from the markdown *source*. Rather than have either reach into the
 * other, both talk through this tiny store using **source line numbers** as
 * the shared coordinate system:
 *
 *  - The Viewer publishes `activeLine` — the source line of the heading whose
 *    section currently occupies the top of the viewport. The Outline
 *    highlights the entry with that line.
 *  - The Outline calls `jumpToLine(line)`; the Viewer, which registered the
 *    real implementation on mount, scrolls that block into view.
 *
 * Lines beat slugs here: comrak's `data-sourcepos` gives us exact line ranges,
 * whereas slug matching breaks on duplicate heading text (post-render.ts
 * suffixes dupes with `-1`, the Outline's slugify doesn't).
 *
 * v0.6.0+.
 */

class ViewNav {
  /** Source line of the heading currently at the top of the viewport. */
  activeLine = $state<number | null>(null);
  /** Source line of the top-most visible block, heading or not. */
  topLine = $state<number | null>(null);
  /** 0..1 progress through the document — drives the outline's progress rail. */
  progress = $state(0);

  /** Installed by the Viewer on mount, cleared on destroy. */
  private scroller: ((line: number, opts?: { smooth?: boolean }) => void) | null = null;

  registerScroller(fn: (line: number, opts?: { smooth?: boolean }) => void) {
    this.scroller = fn;
    return () => {
      if (this.scroller === fn) this.scroller = null;
    };
  }

  /** True when a Viewer is mounted and able to service jumps. */
  get canJump(): boolean {
    return this.scroller !== null;
  }

  /**
   * Scroll the rendered document so the block starting at `line` is at the
   * top of the viewport. Falls back to a slug lookup when no Viewer is
   * mounted (e.g. the user is in edit mode and the Outline is still visible).
   */
  jumpToLine(line: number, fallbackId?: string) {
    if (this.scroller) {
      this.scroller(line, { smooth: true });
      return;
    }
    if (fallbackId) {
      document.getElementById(fallbackId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /** Called by the Viewer as it scrolls. */
  publish(activeLine: number | null, topLine: number | null, progress: number) {
    if (this.activeLine !== activeLine) this.activeLine = activeLine;
    if (this.topLine !== topLine) this.topLine = topLine;
    // Round to whole percent — the rail can't show more resolution than that,
    // and it keeps us from waking every subscriber on sub-pixel scrolls.
    const p = Math.round(progress * 100) / 100;
    if (this.progress !== p) this.progress = p;
  }

  /** Reset on tab switch / file close so stale highlights don't linger. */
  reset() {
    this.activeLine = null;
    this.topLine = null;
    this.progress = 0;
  }
}

export const viewNav = new ViewNav();
