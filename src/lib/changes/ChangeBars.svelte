<script lang="ts">
  /**
   * The margin bars.
   *
   * The rule this replaces an earlier attempt with: **the prose is never
   * recoloured.** A document has two planes — the text is the content, the
   * margin is where the software is allowed to speak. Washing a paragraph in
   * yellow because one word inside it moved puts the software's commentary
   * inside the thing you are trying to read, which is why it looked wrong in
   * every colour it was tried in. Every serious tool ends up in the margin:
   * VS Code's gutter, Word's changed-line bar, Google Docs' change marks.
   *
   * Bars are positioned from `offsetTop`/`offsetHeight` of the rendered blocks
   * — layout coordinates, not `getBoundingClientRect()`, which would be
   * relative to the viewport and so wrong the moment the reader scrolls.
   */
  import type { Revision } from "./types";
  import { relativeTime } from "./time";
  import { describeRegions } from "./regions";

  interface Placed {
    key: string;
    top: number;
    height: number;
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
  let hovered = $state<string | null>(null);

  /**
   * Map each region's source line range onto the blocks comrak rendered from
   * those lines, then collapse them to one bar.
   *
   * Several revisions can touch the same lines — that is the "the agent tweaked
   * this paragraph three times" case. They are merged into a single bar
   * carrying a count rather than drawn as parallel rules: three lines inside a
   * gutter this narrow are hard to tell apart and hard to hit, and the
   * iteration history has room to be shown properly in the overlay.
   */
  function measure() {
    if (!container) {
      placed = [];
      return;
    }
    const blocks = Array.from(
      container.querySelectorAll<HTMLElement>("[data-sourcepos]"),
    ).map((el) => {
      const m = /^(\d+):\d+-(\d+):\d+$/.exec(el.dataset.sourcepos ?? "");
      return m ? { el, from: +m[1], to: +m[2] } : null;
    });

    // Keyed by pixel span so revisions hitting the same blocks stack into one.
    const bySpan = new Map<string, Placed>();

    for (const rev of revisions) {
      if (rev.reviewed && !keepReviewed) continue;
      for (let i = 0; i < rev.regions.length; i++) {
        const r = rev.regions[i];
        let top = Infinity;
        let bottom = -Infinity;
        for (const b of blocks) {
          if (!b) continue;
          if (b.from > r.to || b.to < r.from) continue;
          top = Math.min(top, b.el.offsetTop);
          bottom = Math.max(bottom, b.el.offsetTop + b.el.offsetHeight);
        }
        if (top === Infinity) continue;
        const key = `${Math.round(top)}-${Math.round(bottom)}`;
        const existing = bySpan.get(key);
        if (existing) {
          existing.count += 1;
          // A span reads as unreviewed if *any* revision touching it is
          // unreviewed — otherwise a passage edited twice, one of which you
          // have seen, would go quiet with something still unread in it.
          // `revisions` arrives newest-first, so the bar keeps the newest one
          // as its click target: "what happened here most recently" is the
          // question, and the overlay's stepper walks back from there.
          existing.reviewed = existing.reviewed && rev.reviewed;
          continue;
        }
        bySpan.set(key, {
          key,
          top,
          height: Math.max(18, bottom - top),
          kind: r.kind,
          reviewed: rev.reviewed,
          count: 1,
          revisionId: rev.id,
          label: `${describeRegions([r])} · ${relativeTime(rev.at)}`,
        });
      }
    }
    placed = [...bySpan.values()].sort((a, b) => a.top - b.top);
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

  // Blocks change height when images load or a mermaid diagram renders, both of
  // which happen well after the HTML lands. Without this the bars sit against
  // the pre-render layout and drift down the page.
  $effect(() => {
    if (!container) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    return () => ro.disconnect();
  });
</script>

{#each placed as p (p.key)}
  <button
    class="change-bar"
    class:reviewed={p.reviewed}
    class:added={p.kind === "added"}
    class:removed={p.kind === "removed"}
    style="top: {p.top}px; height: {p.height}px;"
    title={p.label}
    aria-label={`Show what changed: ${p.label}`}
    onmouseenter={() => (hovered = p.key)}
    onmouseleave={() => (hovered = null)}
    onclick={() => onOpen(p.revisionId, 0)}
  >
    {#if p.count > 1}<span class="count">{p.count}</span>{/if}
  </button>
  {#if hovered === p.key}
    <div class="change-peek" style="top: {p.top}px;">{p.label}</div>
  {/if}
{/each}

<style>
  /* Positioned against `.viewer`, which is `position: relative` and is the
     scroll container — so `top` is in document coordinates and the bar scrolls
     with the text for free, with no scroll handler involved. */
  .change-bar {
    position: absolute;
    left: max(0.6rem, calc((100% - var(--content-width, 70ch)) / 2 - 1.15rem));
    width: 3px;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: var(--accent);
    opacity: .85;
    cursor: pointer;
    z-index: 1;
    transition: opacity 120ms ease, width 120ms ease, transform 120ms ease;
  }
  .change-bar:hover,
  .change-bar:focus-visible {
    opacity: 1;
    width: 5px;
    transform: translateX(-1px);
    outline: none;
  }
  .change-bar.added { background: var(--ok, #3f9a5a); }
  .change-bar.removed { background: var(--danger, #b4453f); }
  /* Reviewed marks stay, faintly: "something changed here at some point" is
     still worth being able to answer, and it costs one shade of ink. */
  .change-bar.reviewed { opacity: .28; width: 2px; }
  .change-bar.reviewed:hover { opacity: .7; width: 4px; }

  .count {
    position: absolute;
    top: 0;
    left: -3px;
    font-size: 9px;
    line-height: 1;
    font-weight: 700;
    padding: 2px 3px;
    border-radius: 4px;
    color: var(--bg);
    background: inherit;
  }

  .change-peek {
    position: absolute;
    left: max(1.4rem, calc((100% - var(--content-width, 70ch)) / 2 - 0.4rem));
    transform: translateY(-1.6em);
    z-index: 6;
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

  @media (prefers-reduced-motion: reduce) {
    .change-bar { transition: none; }
  }
</style>
