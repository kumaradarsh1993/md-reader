<script lang="ts">
  /**
   * The margin marks: one small badge per changed passage, and a hairline
   * dotted underline on the passage itself.
   *
   * Two rules, one inherited and one new.
   *
   * Inherited: **the prose is never recoloured.** A document has two planes —
   * the text is the content, the margin is where the software is allowed to
   * speak. Washing a paragraph in yellow because a word moved puts the
   * software's commentary inside the thing you are trying to read. The one
   * thing drawn *on* the prose here is a dotted underline in a near-invisible
   * tint: enough that someone looking for it can see exactly which sentences
   * are new, not enough to be seen by someone who is just reading.
   *
   * New: **one badge per passage, not a bar down its whole length.** The bar
   * was tall enough that when its `left` was computed wrongly it cut through
   * the text like a rule. A badge at the top of the passage is a small target
   * that says "this changed — click for before and after"; the underline says
   * how far the change extends. Between them the bar's two jobs are covered
   * with less ink.
   *
   * Positioning is from `offsetTop`/`offsetLeft` — layout coordinates, not
   * `getBoundingClientRect()`, which is relative to the viewport and so wrong
   * the moment the reader scrolls. The horizontal position is measured off the
   * rendered `.prose` column rather than derived from the width setting: the
   * previous version did the arithmetic from `--content-width`, which is not
   * where the column sits in full-width mode or with the comment lane
   * reserved, and that is how a bar ended up a third of the way into the text
   * on an external monitor.
   */
  import type { Revision } from "./types";
  import { relativeTime } from "./time";
  import { describeRegions } from "./regions";

  interface Placed {
    key: string;
    top: number;
    kind: string;
    reviewed: boolean;
    count: number;
    revisionId: number;
    label: string;
  }

  interface Props {
    /** The rendered article, for measuring. */
    container: HTMLElement | null;
    revisions: Revision[];
    /** Bumped by the parent whenever the document is re-rendered. */
    renderTick: number;
    keepReviewed: boolean;
    onOpen: (revisionId: number, regionIndex: number) => void;
  }
  let { container, revisions, renderTick, keepReviewed, onOpen }: Props = $props();

  let placed = $state<Placed[]>([]);
  /** Left edge of the badge column, in the viewer's layout coordinates. */
  let left = $state(8);
  let hovered = $state<string | null>(null);

  const BADGE = 18;
  /** Gap between the badge's right edge and the first character of prose. */
  const GAP = 10;

  const UNDERLINE = "changed-block";
  const UNDERLINE_SEEN = "changed-block-seen";

  function clearUnderlines(root: HTMLElement) {
    root.querySelectorAll(`.${UNDERLINE}, .${UNDERLINE_SEEN}`).forEach((el) => {
      el.classList.remove(UNDERLINE, UNDERLINE_SEEN);
    });
  }

  /** Does this rendered block's source range touch `[from, to]`? */
  function overlaps(el: HTMLElement, from: number, to: number): boolean {
    const m = /^(\d+):\d+-(\d+):\d+$/.exec(el.dataset.sourcepos ?? "");
    if (!m) return false;
    return !(+m[1] > to || +m[2] < from);
  }

  /**
   * Map each region's source line range onto the blocks comrak rendered from
   * those lines: badge at the top of the first block, underline on every
   * block the region covers.
   *
   * Several revisions can touch the same lines — the "the agent tweaked this
   * paragraph three times" case. They fold into one badge carrying a count
   * rather than a stack of badges: three targets in a 20px gutter are hard to
   * tell apart, and the overlay's stepper has room to walk the iterations.
   */
  function measure() {
    if (!container) {
      placed = [];
      return;
    }
    clearUnderlines(container);

    const prose = container.querySelector<HTMLElement>(".prose");
    if (prose) {
      const pad = parseFloat(getComputedStyle(prose).paddingLeft) || 0;
      left = Math.max(4, prose.offsetLeft + pad - GAP - BADGE);
    }

    const blocks = Array.from(
      container.querySelectorAll<HTMLElement>("[data-sourcepos]"),
    ).map((el) => {
      const m = /^(\d+):\d+-(\d+):\d+$/.exec(el.dataset.sourcepos ?? "");
      return m ? { el, from: +m[1], to: +m[2] } : null;
    });

    // Keyed by the first block's top so revisions hitting the same passage
    // stack into one badge.
    const byTop = new Map<string, Placed>();

    for (const rev of revisions) {
      if (rev.reviewed && !keepReviewed) continue;
      for (let i = 0; i < rev.regions.length; i++) {
        const r = rev.regions[i];
        let top = Infinity;
        const touched: HTMLElement[] = [];
        for (const b of blocks) {
          if (!b) continue;
          if (b.from > r.to || b.to < r.from) continue;
          // Only the outermost block of a nested structure (a list, a
          // blockquote): underlining every `li` *and* the `ul` doubles the
          // dots. If the nearest enclosing block also overlaps the region,
          // that one will carry the underline.
          const parent = b.el.parentElement?.closest<HTMLElement>("[data-sourcepos]");
          if (parent && overlaps(parent, r.from, r.to)) continue;
          top = Math.min(top, b.el.offsetTop);
          touched.push(b.el);
        }
        if (top === Infinity) continue;

        // Removals have nothing to underline; the badge alone marks the seam.
        if (r.kind !== "removed") {
          for (const el of touched) el.classList.add(rev.reviewed ? UNDERLINE_SEEN : UNDERLINE);
        }

        const key = String(Math.round(top));
        const existing = byTop.get(key);
        if (existing) {
          existing.count += 1;
          // Unreviewed if *any* revision touching it is unreviewed — otherwise
          // a passage edited twice, one of which you have seen, would go quiet
          // with something still unread in it. `revisions` arrives newest-first,
          // so the badge keeps the newest as its click target.
          existing.reviewed = existing.reviewed && rev.reviewed;
          continue;
        }
        byTop.set(key, {
          key,
          top,
          kind: r.kind,
          reviewed: rev.reviewed,
          count: 1,
          revisionId: rev.id,
          label: `${describeRegions([r])} · ${relativeTime(rev.at)}`,
        });
      }
    }
    placed = [...byTop.values()].sort((a, b) => a.top - b.top);
  }

  // Re-measure when the document re-renders or the revision set changes.
  // `renderTick` is the parent's signal that the HTML has been swapped —
  // measuring off `revisions` alone would read the previous document's layout.
  $effect(() => {
    void renderTick;
    void revisions;
    void keepReviewed;
    void container;
    measure();
  });

  // Blocks change height when images load or a mermaid diagram renders, and
  // the column moves when the window or the side panel is resized. Both
  // happen well after the HTML lands.
  $effect(() => {
    if (!container) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    const prose = container.querySelector(".prose");
    if (prose) ro.observe(prose);
    return () => ro.disconnect();
  });

  // Leave the prose clean if the marks are switched off or the component goes.
  $effect(() => {
    return () => {
      if (container) clearUnderlines(container);
    };
  });
</script>

{#each placed as p (p.key)}
  <button
    class="change-badge"
    class:reviewed={p.reviewed}
    class:added={p.kind === "added"}
    class:removed={p.kind === "removed"}
    style="top: {p.top}px; left: {left}px;"
    aria-label={`Show what changed: ${p.label}`}
    onmouseenter={() => (hovered = p.key)}
    onmouseleave={() => (hovered = null)}
    onfocus={() => (hovered = p.key)}
    onblur={() => (hovered = null)}
    onclick={() => onOpen(p.revisionId, 0)}
  >
    {#if p.count > 1}
      <span class="count">{p.count}</span>
    {:else}
      <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
        <path d="M11.5 2.5l2 2L6 12H4v-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M2 14h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
    {/if}
  </button>
  {#if hovered === p.key}
    <div class="change-peek" style="top: {p.top}px; left: {left + BADGE + 8}px;">{p.label}</div>
  {/if}
{/each}

<style>
  /* Positioned against `.viewer`, which is `position: relative` and is the
     scroll container — so `top` is in document coordinates and the badge
     scrolls with the text for free, with no scroll handler involved. */
  .change-badge {
    position: absolute;
    width: 18px;
    height: 18px;
    /* Sit on the first text line of the block rather than on its top edge —
       blocks carry margin-top that the badge should not float in. */
    margin-top: .15em;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--changed, #d99a1e) 55%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--changed, #d99a1e) 14%, var(--bg));
    color: var(--changed, #d99a1e);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 1;
    transition: background-color 120ms ease, transform 120ms ease, opacity 120ms ease;
  }
  .change-badge:hover,
  .change-badge:focus-visible {
    background: color-mix(in srgb, var(--changed, #d99a1e) 26%, var(--bg));
    transform: scale(1.08);
    outline: none;
  }
  .change-badge.added {
    border-color: color-mix(in srgb, var(--ok, #3f9a5a) 55%, transparent);
    background: color-mix(in srgb, var(--ok, #3f9a5a) 12%, var(--bg));
    color: var(--ok, #3f9a5a);
  }
  .change-badge.removed {
    border-color: color-mix(in srgb, var(--danger, #b4453f) 55%, transparent);
    background: color-mix(in srgb, var(--danger, #b4453f) 12%, var(--bg));
    color: var(--danger, #b4453f);
  }
  /* Reviewed marks stay, faintly: "something changed here at some point" is
     still worth being able to answer, and it costs one shade of ink. */
  .change-badge.reviewed { opacity: .32; }
  .change-badge.reviewed:hover { opacity: .8; }

  .count {
    font-size: 9.5px;
    line-height: 1;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .change-peek {
    position: absolute;
    z-index: 6;
    margin-top: -.15em;
    padding: .2rem .45rem;
    font-size: 11px;
    white-space: nowrap;
    color: var(--fg-strong);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 5px;
    box-shadow: var(--shadow-sm);
    pointer-events: none;
  }

  /* The underline. Applied to rendered blocks, hence `:global`. A dotted rule
     in a soft blue-grey, set well under the text — the reader who is looking
     for "what exactly changed" finds it; the reader who is just reading does
     not trip on it. `text-decoration` rather than a border so every wrapped
     line gets its own rule; `skip-ink` keeps descenders clean. */
  :global(.prose .changed-block) {
    text-decoration: underline dotted;
    text-decoration-color: color-mix(in srgb, #5b8fd6 45%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: .22em;
    text-decoration-skip-ink: auto;
  }
  :global(.prose .changed-block a) {
    /* Links keep their own underline; the change dots would double up. */
    text-decoration-color: currentColor;
  }
  :global(.prose .changed-block-seen) {
    text-decoration: underline dotted;
    text-decoration-color: color-mix(in srgb, #5b8fd6 18%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: .22em;
    text-decoration-skip-ink: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .change-badge { transition: none; }
  }
</style>
