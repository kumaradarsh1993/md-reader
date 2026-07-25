<script lang="ts">
  /**
   * "You left off here" indicator — the Word-style resume bookmark.
   *
   * Two coordinated parts, both purely presentational (the Viewer owns all
   * geometry and hands it down):
   *
   *  1. **The ribbon.** A hairline rule across the content column at the
   *     remembered position, with a small bookmark tag on the left. Bright for
   *     a few seconds after a resume, then settles to a whisper so it stays
   *     findable without competing with the text.
   *  2. **The edge marker.** A slim tab pinned to the right gutter at the
   *     mark's proportional depth, shown only once the ribbon has scrolled out
   *     of view. Click it to travel back. This is the part that earns its keep
   *     on long documents — the same job Word's scrollbar bookmark does.
   *
   * v0.6.0+.
   */

  interface Props {
    /** Offset of the ribbon within the scrolled content, in px. */
    top: number;
    /** Ribbon is mounted and in the document flow. */
    show: boolean;
    /** Ribbon is currently within the visible band. */
    inView: boolean;
    /** Viewport coordinates for the gutter marker. Fixed positioning keeps it
     *  out of the scrolled content, where a percentage offset would drift. */
    edgeTop: number;
    edgeRight: number;
    /** Freshly resumed — plays the reveal animation and shows the full label. */
    fresh: boolean;
    onJump: () => void;
    onDismiss: () => void;
  }
  let { top, show, inView, edgeTop, edgeRight, fresh, onJump, onDismiss }: Props = $props();
</script>

{#if show}
  <div
    class="ribbon"
    class:fresh
    style="top: {top}px"
    role="note"
    aria-label="Where you left off reading"
  >
    <span class="rule" aria-hidden="true"></span>
    <button class="tag" onclick={onDismiss} title="Dismiss this marker">
      <span class="text">You left off here</span>
      <span class="x" aria-hidden="true">✕</span>
    </button>
  </div>

  {#if !inView}
    <button
      class="edge"
      style="top: {edgeTop}px; right: {edgeRight}px"
      onclick={onJump}
      title="Jump back to where you left off"
      aria-label="Jump back to where you left off"
    >
      <span class="edge-notch" aria-hidden="true"></span>
      <span class="edge-label">Left off</span>
    </button>
  {/if}
{/if}

<style>
  .ribbon {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    z-index: 3;
    pointer-events: none;
    display: flex;
    align-items: center;
    /* Settle from "look at me" to "findable" over a few seconds. */
    opacity: .38;
    transition: opacity 1.6s ease 2.4s;
  }
  .ribbon.fresh {
    opacity: 1;
    animation: ribbon-in .5s cubic-bezier(.2, .9, .3, 1.1) both;
  }
  @keyframes ribbon-in {
    from { opacity: 0; transform: translateX(-8px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .rule {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    /* Fades out to the right so the marker reads as an annotation in the
       margin rather than a rule slicing the page in half. Plain gradient
       stops, deliberately — color-mix() isn't guaranteed on older WebView2. */
    background: linear-gradient(to right, var(--accent) 0%, var(--accent) 12%, transparent 68%);
    opacity: .8;
  }
  .tag {
    position: relative;
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: .4em;
    margin-left: clamp(1.25rem, 5vw, 3.5rem);
    height: 20px;
    padding: 0 .5em 0 .55em;
    background: var(--bg-elevated);
    border: 1px solid var(--accent);
    /* Squared on the left, rounded on the right: the tag reads as a bookmark
       tab poking out of the margin. That shape is the metaphor, which is why
       there's no icon — a glyph here is one more thing to fall back badly on
       a platform that lacks it. */
    border-radius: 3px 10px 10px 3px;
    color: var(--accent);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: .04em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transform: translateY(-50%);
    line-height: 1;
    white-space: nowrap;
  }
  .tag:hover { background: var(--accent-soft); }
  .tag .x { opacity: 0; font-size: 9px; transition: opacity 120ms ease; }
  .tag:hover .x { opacity: .75; }

  /* ─── Right-gutter marker ─────────────────────────────────────────── */
  .edge {
    position: fixed;
    z-index: 12;
    display: inline-flex;
    align-items: center;
    gap: .35em;
    height: 18px;
    padding: 0 .4em 0 .3em;
    background: var(--bg-elevated);
    border: 1px solid var(--accent);
    border-radius: 999px;
    color: var(--accent);
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    opacity: .55;
    transition: opacity 140ms ease, transform 140ms ease;
    transform: translateY(-50%);
  }
  .edge:hover { opacity: 1; transform: translateY(-50%) translateX(-2px); }
  .edge-notch {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
  }
  .edge-label { line-height: 1; }

  @media (prefers-reduced-motion: reduce) {
    .ribbon, .ribbon.fresh { animation: none; transition: none; }
    .edge { transition: none; }
  }
</style>
