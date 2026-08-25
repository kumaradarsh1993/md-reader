<script lang="ts">
  /**
   * "Last here" — the resume bookmark, as a single mark in the right margin.
   *
   * This replaces the v0.6–v0.8 ResumeRibbon, which was two coordinated
   * things: a hairline rule drawn *across the text column* with a "YOU LEFT
   * OFF HERE" tag hanging off its left end, plus a separate "LEFT OFF" pill in
   * the right gutter that appeared only once the rule had scrolled away. Three
   * problems with that, all reported from real use:
   *
   *  - **It sat on top of what you were reading.** A rule across the column
   *    with a tag in the margin is furniture in the middle of the page.
   *  - **The two halves lived on opposite sides**, so the thing you could see
   *    (right) was never the thing you could dismiss (left) — you had to
   *    scroll the rule back into view to find its ✕.
   *  - **It said too much.** "You left off here" claims a precision the app
   *    does not have: what is remembered is the block that was at the top of
   *    the viewport, not the sentence you stopped on.
   *
   * So: one element, always in the right margin, always dismissible, never
   * over the text. It tracks the anchor while the anchor is on screen and
   * pins to the nearer edge with a direction chevron when it isn't — which is
   * also what tells you which way to scroll to get back.
   *
   * v0.9.0+.
   */

  interface Props {
    /** Mounted at all — gated upstream on the setting, the mark and dismissal. */
    show: boolean;
    /** Viewport Y (px) to sit at, already clamped into the visible band. */
    y: number;
    /** Distance from the window's right edge, in px. */
    right: number;
    /** Where the anchor is relative to the viewport. Drives the glyph.
     *  Not named `state` — a local binding by that name shadows the `$state`
     *  rune and svelte-check treats every use of it as a store subscription. */
    anchor: "above" | "in-view" | "below";
    /** Freshly resumed — plays the reveal and holds the label open briefly. */
    fresh: boolean;
    onJump: () => void;
    onDismiss: () => void;
  }
  let { show, y, right, anchor, fresh, onJump, onDismiss }: Props = $props();

  let hovering = $state(false);
  /** The label is shown on arrival and on hover; the rest of the time this is
   *  a small tick in the margin, which is all a bookmark needs to be. */
  let expanded = $derived(fresh || hovering);
</script>

{#if show}
  <div
    class="marker"
    class:fresh
    class:expanded
    style="top: {y}px; right: {right}px"
    onpointerenter={() => (hovering = true)}
    onpointerleave={() => (hovering = false)}
    role="note"
    aria-label="Your last reading position"
  >
    <button
      class="go"
      onclick={onJump}
      title={anchor === "in-view"
        ? "Your last reading position"
        : `Jump back to where you were reading (${anchor === "above" ? "above" : "below"})`}
    >
      <span class="tick" aria-hidden="true"></span>
      <span class="glyph" aria-hidden="true">
        {#if anchor === "above"}▲{:else if anchor === "below"}▼{:else}●{/if}
      </span>
      <span class="label">Last here</span>
    </button>
    <button class="dismiss" onclick={onDismiss} title="Remove this bookmark" aria-label="Remove bookmark">✕</button>
  </div>
{/if}

<style>
  .marker {
    position: fixed;
    z-index: 12;
    display: flex;
    align-items: center;
    transform: translateY(-50%);
    /* Collapsed it is a tick and a glyph; expanded the label and ✕ slide out.
       Width is not animated — animating it would reflow the pill's contents
       every frame — the label just fades and un-clips. */
    background: var(--bg-elevated);
    border: 1px solid var(--accent);
    border-radius: 999px;
    box-shadow: var(--shadow-sm);
    color: var(--accent);
    height: 20px;
    padding: 0 .15em 0 .3em;
    opacity: .5;
    transition: opacity 140ms ease, transform 140ms ease;
  }
  .marker.expanded { opacity: 1; }
  .marker.fresh { animation: marker-in .45s cubic-bezier(.2, .9, .3, 1.1) both; }
  @keyframes marker-in {
    from { opacity: 0; transform: translateY(-50%) translateX(10px); }
    to   { opacity: 1; transform: translateY(-50%) translateX(0); }
  }

  button {
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 0;
    display: inline-flex;
    align-items: center;
    line-height: 1;
  }
  .go { gap: .3em; padding: 0 .15em; }

  /* A 10px tick pointing into the margin — the part that says "this exact
     line", without a rule that crosses the text. */
  .tick {
    position: absolute;
    right: 100%;
    width: 10px;
    height: 2px;
    border-radius: 1px;
    background: var(--accent);
    opacity: 0;
    transition: opacity 140ms ease;
  }
  .marker.expanded .tick { opacity: .8; }

  .glyph { font-size: 7px; line-height: 1; }

  .label {
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
    white-space: nowrap;
    max-width: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-width 160ms ease, opacity 120ms ease;
  }
  .marker.expanded .label { max-width: 6em; opacity: 1; }

  .dismiss {
    font-size: 9px;
    opacity: 0;
    max-width: 0;
    overflow: hidden;
    transition: max-width 160ms ease, opacity 120ms ease;
  }
  .marker.expanded .dismiss { max-width: 1.6em; opacity: .65; padding: 0 .25em 0 .35em; }
  .dismiss:hover { opacity: 1; }

  @media (prefers-reduced-motion: reduce) {
    .marker, .marker.fresh, .label, .dismiss, .tick { animation: none; transition: none; }
  }
</style>
