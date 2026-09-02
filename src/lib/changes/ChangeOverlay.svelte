<script lang="ts">
  /**
   * Before above, after below.
   *
   * Stacked rather than side by side, and the reason is worth stating because
   * side-by-side looks like the obvious choice: two narrow columns wrap prose
   * differently, so the same sentence breaks at different words on each side
   * and the eye has to re-find its place on every line. Stacked keeps the
   * measure identical, so a changed phrase sits at the same position in both
   * and the difference pops without being hunted for. This is why GitHub's
   * unified view beats split for prose while split wins for code.
   *
   * Within a pair the diff is word-level. Line-level marks a whole line when a
   * single word moved, which is a large part of why the previous attempt read
   * as noise.
   */
  import { untrack } from "svelte";
  import Icon from "../Icon.svelte";
  import { inlineOps } from "./regions";
  import { sessionLabel, offsetLabel, relativeTime } from "./time";
  import type { Revision } from "./types";

  interface Props {
    name: string;
    revisions: Revision[];
    /** Which revision to show first. */
    startId: number;
    onClose: () => void;
    onReviewed: (revisionId: number) => void;
  }
  let { name, revisions, startId, onClose, onReviewed }: Props = $props();

  // Tracked by revision id, not by array index. A scan can land a new revision
  // while the overlay is open, which pushes every index along by one — an
  // index-based cursor would silently start showing a different change.
  // eslint-disable-next-line svelte/no-state-reference-locally -- reading the
  // prop once is the intent: it is the *starting* position of a cursor the
  // reader then drives with the stepper, not a value to stay bound to.
  let currentId = $state(untrack(() => startId));
  let index = $derived.by(() => {
    const i = revisions.findIndex((r) => r.id === currentId);
    return i === -1 ? 0 : i;
  });
  let current = $derived(revisions[index] ?? revisions[0]);
  /** The revision immediately older than this one, for the "+2 min" offset —
   *  the number that actually matters when a burst of edits share a minute. */
  let previous = $derived(revisions[index + 1] ?? null);

  // Opening a change *is* the act of reviewing it, so nothing else has to be
  // clicked. Deliberately not on hover, and never on a timer.
  $effect(() => {
    if (current && !current.reviewed) onReviewed(current.id);
  });

  function step(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= revisions.length) return;
    currentId = revisions[next].id;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      // Left is "older", matching the stepper's reading order.
      step(1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(-1);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" onclick={onClose}></div>

<div class="sheet" role="dialog" aria-modal="true" aria-label={`What changed in ${name}`}>
  <header>
    <div class="who">
      <span class="file">{name}</span>
      {#if current}
        <span class="when">
          {sessionLabel(current.at, current.at)}
          {#if previous}<span class="gap">· {offsetLabel(previous.at, current.at)} after the previous edit</span>{/if}
        </span>
      {/if}
    </div>

    <div class="nav">
      {#if revisions.length > 1}
        <button
          class="step"
          disabled={index >= revisions.length - 1}
          onclick={() => step(1)}
          aria-label="Older change"
          title="Older change"
        >
          <Icon name="chevron-right" size={15} />
        </button>
        <span class="counter">{revisions.length - index} of {revisions.length}</span>
        <button
          class="step"
          disabled={index <= 0}
          onclick={() => step(-1)}
          aria-label="Newer change"
          title="Newer change"
        >
          <Icon name="chevron-right" size={15} />
        </button>
      {/if}
      <button class="close" onclick={onClose} aria-label="Close" title="Close (Esc)">
        <Icon name="x" size={16} />
      </button>
    </div>
  </header>

  <div class="body">
    {#if !current}
      <p class="empty">Nothing recorded for this passage.</p>
    {:else if current.truncated}
      <p class="empty">
        This file changed {relativeTime(current.at)}, but it is too large for Fox MD to
        keep a before-and-after copy of. The change is recorded; the detail is not.
      </p>
    {:else if current.isNew}
      <p class="empty">This file was created {relativeTime(current.at)}.</p>
    {:else}
      {#each current.regions as region, i (i)}
        {@const ops = inlineOps(region.before, region.after)}
        <article class="pair">
          <div class="pair-head">
            <span class="kind {region.kind}">{region.kind}</span>
            <span class="lines">lines {region.from}–{region.to}</span>
          </div>

          {#if region.before}
            <div class="pane before">
              <span class="pane-label">Before</span>
              <p class="text">{#each ops as op}{#if op.kind === "equal"}{op.text}{:else if op.kind === "delete"}<del>{op.text}</del>{/if}{/each}</p>
            </div>
          {/if}

          {#if region.after}
            <div class="pane after">
              <span class="pane-label">{region.before ? "Now" : "Added"}</span>
              <p class="text">{#each ops as op}{#if op.kind === "equal"}{op.text}{:else if op.kind === "insert"}<ins>{op.text}</ins>{/if}{/each}</p>
            </div>
          {/if}

          {#if !region.after}
            <div class="pane removed-note"><span class="pane-label">Removed</span></div>
          {/if}
        </article>
      {/each}
    {/if}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    backdrop-filter: blur(1.5px);
    animation: fade 140ms ease both;
  }
  .sheet {
    position: fixed;
    z-index: 41;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: min(980px, 94vw);
    /* Tall but not full-height: leaving the top of the document visible keeps
       the overlay anchored to the page it is describing, rather than replacing
       it. Rising from the bottom is also the direction the eye is already
       travelling after clicking a bar in the margin. */
    max-height: min(78vh, 900px);
    display: flex;
    flex-direction: column;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-bottom: 0;
    border-radius: 12px 12px 0 0;
    box-shadow: var(--shadow-md);
    animation: rise 180ms cubic-bezier(.2, .7, .3, 1) both;
  }
  @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes rise {
    from { opacity: 0; transform: translateX(-50%) translateY(14px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .scrim, .sheet { animation: none; }
  }

  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: .7rem .9rem .6rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .who { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .file {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--fg-strong);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .when { font-size: 11.5px; color: var(--muted); }
  .gap { opacity: .85; }

  .nav { margin-left: auto; display: flex; align-items: center; gap: .2rem; }
  .counter { font-size: 11px; color: var(--muted); min-width: 4.5em; text-align: center; }
  .step, .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .step:hover:not(:disabled), .close:hover { background: var(--chrome-hover); color: var(--fg-strong); }
  .step:disabled { opacity: .3; cursor: default; }
  /* One chevron glyph, mirrored — an icon set does not need two entries for a
     direction. */
  .step:first-of-type :global(svg) { transform: rotate(180deg); }

  .body { overflow-y: auto; padding: .9rem; display: flex; flex-direction: column; gap: 1.1rem; }
  .empty { margin: 2rem auto; color: var(--muted); font-size: 13px; max-width: 46ch; text-align: center; }

  .pair { display: flex; flex-direction: column; gap: .4rem; }
  .pair-head { display: flex; align-items: baseline; gap: .5rem; }
  .kind {
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: .07em;
    font-weight: 700;
    padding: .1rem .35rem;
    border-radius: 4px;
    color: var(--bg);
    background: var(--accent);
  }
  .kind.added { background: var(--ok, #3f9a5a); }
  .kind.removed { background: var(--danger, #b4453f); }
  .lines { font-size: 10.5px; color: var(--muted); font-family: ui-monospace, Menlo, Consolas, monospace; }

  .pane {
    border-left: 3px solid var(--border);
    padding: .4rem 0 .4rem .7rem;
  }
  .pane.before { border-left-color: var(--danger, #b4453f); }
  .pane.after { border-left-color: var(--ok, #3f9a5a); }
  .pane-label {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--muted);
    margin-bottom: .2rem;
  }
  .text {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--fg);
    /* The source is markdown, so its own line breaks carry meaning (list items,
       headings). Preserving them while still wrapping long paragraphs is
       exactly what pre-wrap is for. */
    white-space: pre-wrap;
    word-break: break-word;
  }
  del {
    background: color-mix(in srgb, var(--danger, #b4453f) 20%, transparent);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--danger, #b4453f) 70%, transparent);
    border-radius: 2px;
  }
  ins {
    background: color-mix(in srgb, var(--ok, #3f9a5a) 22%, transparent);
    text-decoration: none;
    border-radius: 2px;
  }
  .removed-note { border-left-color: var(--danger, #b4453f); }
</style>
