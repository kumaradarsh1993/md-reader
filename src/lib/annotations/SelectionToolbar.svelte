<script lang="ts">
  /**
   * The bar that appears when you select text.
   *
   * Positioned above the selection, or below it when the selection starts near
   * the top of the viewport — a toolbar clipped off the top of the window is
   * the classic version of this control that nobody can use.
   *
   * It is deliberately small and deliberately not a menu: five colours and one
   * "Comment". Choosing a colour is the commonest action by a wide margin, so
   * it costs one click, and the colours *are* their own labels.
   */
  import Icon from "../Icon.svelte";
  import { HIGHLIGHT_COLORS, type HighlightColor } from "./types";

  interface Props {
    /** Viewport coordinates of the selection's bounding box. */
    rect: { top: number; bottom: number; left: number; right: number } | null;
    onHighlight: (color: HighlightColor) => void;
    /** "No highlight" — clears the fill on everything the selection touches. */
    onClear: () => void;
    /** True when the selection is actually sitting on something clearable, so
     *  the control can be present-but-inert rather than appearing and
     *  disappearing as the selection moves. */
    canClear: boolean;
    onComment: () => void;
    onCopy: () => void;
  }
  let { rect, onHighlight, onClear, canClear, onComment, onCopy }: Props = $props();

  const BAR_H = 36;
  const GAP = 8;

  let el: HTMLDivElement | undefined = $state();
  let width = $state(240);

  $effect(() => {
    void rect;
    if (el) width = el.offsetWidth;
  });

  let placed = $derived.by(() => {
    if (!rect) return null;
    const above = rect.top - BAR_H - GAP;
    const below = rect.bottom + GAP;
    const top = above > 8 ? above : below;
    const centre = (rect.left + rect.right) / 2;
    const left = Math.min(
      Math.max(10, centre - width / 2),
      Math.max(10, window.innerWidth - width - 10),
    );
    return { top, left, flipped: above <= 8 };
  });
</script>

{#if rect && placed}
  <div
    class="sel-bar"
    class:flipped={placed.flipped}
    style="top: {placed.top}px; left: {placed.left}px;"
    bind:this={el}
    role="toolbar"
    tabindex="-1"
    aria-label="Annotate selection"
    onmousedown={(e) => e.preventDefault()}
  >
    <div class="swatches">
      {#each HIGHLIGHT_COLORS as c (c)}
        <button
          class="swatch {c}"
          onclick={() => onHighlight(c)}
          title="Highlight {c}"
          aria-label="Highlight {c}"
        ></button>
      {/each}
      <!-- The "no fill" swatch, in the colour row where every editor puts it.
           Always present, so its position never moves; dimmed when the
           selection has nothing to clear. -->
      <button
        class="swatch none"
        class:inert={!canClear}
        onclick={onClear}
        disabled={!canClear}
        title={canClear ? "No highlight — remove it from this selection" : "No highlight here"}
        aria-label="No highlight"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line x1="4.5" y1="15.5" x2="15.5" y2="4.5" />
        </svg>
      </button>
    </div>
    <span class="divider"></span>
    <button class="action" onclick={onComment} title="Comment on this selection">
      <Icon name="message-square-plus" size={14} />
      <span>Comment</span>
    </button>
    <button class="action icon-only" onclick={onCopy} title="Copy selection" aria-label="Copy selection">
      <Icon name="copy" size={14} />
    </button>
  </div>
{/if}

<style>
  .sel-bar {
    position: fixed;
    z-index: 70;
    display: flex;
    align-items: center;
    gap: .3rem;
    height: 36px;
    padding: 0 .35rem;
    border-radius: 9px;
    background: var(--chrome-bg);
    border: 1px solid var(--border);
    box-shadow: 0 6px 20px rgba(0, 0, 0, .18);
    font-size: 12px;
    color: var(--fg-strong);
    animation: sel-in .12s ease-out;
  }
  @keyframes sel-in {
    from { opacity: 0; transform: translateY(3px); }
    to { opacity: 1; transform: none; }
  }
  .sel-bar.flipped { animation-name: sel-in-down; }
  @keyframes sel-in-down {
    from { opacity: 0; transform: translateY(-3px); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sel-bar { animation: none; }
  }

  .swatches { display: flex; gap: .18rem; }
  .swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, .16);
    cursor: pointer;
    padding: 0;
    transition: transform .1s ease;
  }
  .swatch:hover { transform: scale(1.16); }
  /* The same five tints the highlights themselves use, at full strength here so
     a swatch reads as a colour rather than as a wash. */
  .swatch.yellow { background: #ffd84d; }
  .swatch.green  { background: #7fd99a; }
  .swatch.blue   { background: #86c5f5; }
  .swatch.pink   { background: #f9a3bd; }
  .swatch.purple { background: #c3a5f0; }
  /* No fill: the paper itself, with a slash. Reads as "none" rather than as a
     sixth colour, which a white circle alone would not. */
  .swatch.none {
    background: var(--bg);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .swatch.none svg {
    width: 100%;
    height: 100%;
    stroke: var(--danger, #c0392b);
    stroke-width: 1.6;
    stroke-linecap: round;
    fill: none;
  }
  .swatch.none.inert { opacity: .35; cursor: default; }
  .swatch.none.inert:hover { transform: none; }

  .divider {
    width: 1px;
    height: 18px;
    background: var(--border);
    margin: 0 .15rem;
  }

  .action {
    display: inline-flex;
    align-items: center;
    gap: .3rem;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: .3rem .45rem;
    border-radius: 6px;
    white-space: nowrap;
  }
  .action:hover { background: var(--hover-bg); }
  .icon-only { padding: .3rem; }
</style>
