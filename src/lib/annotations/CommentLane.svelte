<script lang="ts">
  /**
   * The right margin lane.
   *
   * ## Why the lane is reserved, not overlaid
   *
   * The brief was explicit that threads must not sit permanently open, and must
   * not overlap anything. Those two pull in opposite directions if the lane is
   * an overlay: a collapsed marker needs 26px, an expanded card needs ~300, and
   * an overlay that grows on click has to land *somewhere* — over the text is
   * the only place left. So the lane is reserved whenever the layer is on and
   * the document has notes: expanding costs no reflow because the space was
   * already there, and nothing is ever covered.
   *
   * Below `MIN_RESERVED` of pane width there is no honest way to give up 300px,
   * so the lane goes narrow and expanded cards float over the right edge with a
   * shadow. That is a worse experience, which is why it is the *narrow-window*
   * behaviour and not the default.
   *
   * ## Stacking
   *
   * Cards want to sit level with their text, and several notes on one paragraph
   * want the same pixel. A single downward pass — `y = max(wanted, previous
   * bottom + GAP)` — resolves it, in document order, so a card never moves
   * above its anchor and the reading order of the lane always matches the
   * reading order of the page. Heights are measured after paint, because a card
   * holding three paragraphs cannot be predicted.
   */
  import CommentCard from "./CommentCard.svelte";
  import { annotations } from "./store.svelte";
  import type { HighlightColor, Placed } from "./types";

  interface Props {
    placed: Placed[];
    detachedIds: string[];
    author: string;
    /** Pane width, so the lane can decide whether reserving is honest. */
    paneWidth: number;
    onGoTo: (id: string) => void;
  }
  let { placed, detachedIds, author, paneWidth, onGoTo }: Props = $props();

  const GAP = 8;
  const MIN_RESERVED = 900;

  let floating = $derived(paneWidth < MIN_RESERVED);
  let heights = $state<Record<string, number>>({});
  let laneEl: HTMLDivElement | undefined = $state();

  /**
   * Resolve the wanted positions into non-overlapping ones.
   *
   * Reads `heights`, which is written by the measuring effect below — so the
   * dependency runs one way only: measure → layout → paint. An effect that both
   * measured and positioned would feed its own writes back in and stall.
   */
  let laidOut = $derived.by(() => {
    const out: Array<{ p: Placed; y: number }> = [];
    let cursor = -Infinity;
    for (const p of [...placed].sort((a, b) => a.top - b.top)) {
      const h = heights[p.ann.id] ?? (annotations.expandedId === p.ann.id ? 120 : 22);
      const y = Math.max(p.top, cursor + GAP);
      out.push({ p, y });
      cursor = y + h;
    }
    return out;
  });

  /** Measure after paint. A ResizeObserver rather than a post-render read
   *  because a card's height changes while you type into it. */
  function measure(node: HTMLElement, id: string) {
    const apply = () => {
      const h = node.offsetHeight;
      if (heights[id] !== h) heights = { ...heights, [id]: h };
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  }

  /** `null` is "no highlight" — the store turns that into a fill clear, which
   *  keeps the thread and only removes the colour. */
  function onColor(id: string, c: HighlightColor | null) { annotations.setColor(id, c); }
</script>

<div class="lane" class:floating bind:this={laneEl} aria-label="Comments">
  {#each laidOut as { p, y } (p.ann.id)}
    {@const isOpen = annotations.expandedId === p.ann.id}
    <div
      class="slot"
      class:open={isOpen}
      style="top: {y}px"
      use:measure={p.ann.id}
    >
      <CommentCard
        ann={p.ann}
        expanded={isOpen}
        detached={detachedIds.includes(p.ann.id)}
        {author}
        onToggle={() => annotations.toggleExpanded(p.ann.id)}
        onReply={(parentId, body) => annotations.reply(p.ann.id, parentId, author, body)}
        onEdit={(noteId, body) => annotations.editNote(p.ann.id, noteId, body)}
        onDeleteNote={(noteId) => annotations.deleteNote(p.ann.id, noteId)}
        onDelete={() => annotations.remove(p.ann.id)}
        onColor={(c) => onColor(p.ann.id, c)}
        onToggleResolved={() => annotations.toggleResolved(p.ann.id)}
        onGoTo={() => onGoTo(p.ann.id)}
      />
    </div>
  {/each}
</div>

<style>
  /* Absolutely positioned inside `.viewer`, which is the scroll container and
     `position: relative` — so lane coordinates are content-space and the cards
     scroll with the document for free, with no scroll listener at all. That is
     what makes them behave "as part of the page". */
  .lane {
    position: absolute;
    top: 0;
    right: 0;
    width: var(--comment-lane, 320px);
    height: 100%;
    pointer-events: none;
  }
  .slot {
    position: absolute;
    left: 8px;
    width: calc(100% - 16px);
    pointer-events: auto;
    /* Moving to a new resting place should read as the stack making room, not
       as a jump. Only `top` animates — height must not, or a growing composer
       lags the text being typed into it. */
    transition: top .16s cubic-bezier(.22, .61, .36, 1);
  }
  .slot.open { z-index: 2; }

  /* Narrow pane: no reserved column, so the open card floats over the edge. */
  .lane.floating { width: 40px; }
  .lane.floating .slot { left: auto; right: 6px; width: 26px; }
  .lane.floating .slot.open {
    right: 6px;
    width: min(330px, calc(100vw - 60px));
    filter: drop-shadow(0 6px 20px rgba(0, 0, 0, .22));
  }

  @media (prefers-reduced-motion: reduce) {
    .slot { transition: none; }
  }
</style>
