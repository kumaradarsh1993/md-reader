<script lang="ts">
  /**
   * Before on the left, after on the right.
   *
   * The previous version stacked them (before above, after below) and argued
   * for it well: identical measure, identical wrapping, a changed word sits at
   * the same spot in both. The owner read it in use and asked for side by side
   * — for prose he compares by *reading* the two paragraphs, not by scanning
   * for the shifted word, and reading is easier when both are on screen at
   * once without scrolling between them. So: two columns, the same font as the
   * document, with the word-level marks doing the pointing.
   *
   * Two things carried over. The diff inside a pair is word-level — line-level
   * marks a whole line when one word moved, which is a large part of why the
   * older attempt read as noise. And opening this *is* reviewing: nothing else
   * needs clicking to make the mark in the margin go quiet.
   *
   * New: a few lines of the surrounding document, dimmed, above and below each
   * pair. A changed paragraph is judged against its neighbours ("does this
   * still follow from the previous point?"), and a diff cut exactly at the
   * paragraph's edges gives nothing to judge it against. Context is unchanged
   * text by definition, so the same lines serve both columns.
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
    /** The document as it is now, for the context lines. Null when the file
     *  shown in the overlay is not the one on screen. */
    source?: string | null;
    onClose: () => void;
    onReviewed: (revisionId: number) => void;
  }
  let { name, revisions, startId, source = null, onClose, onReviewed }: Props = $props();

  /** Lines of surrounding document shown above and below a changed passage. */
  const CONTEXT_LINES = 3;

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

  let lines = $derived(source ? source.split("\n") : null);

  /**
   * Unchanged lines around a region, from the current document. Only exact
   * for the newest revision — older ones describe line numbers in a document
   * that has since moved on — so context is offered for the newest and
   * omitted otherwise, rather than shown wrong.
   */
  function contextFor(from: number, to: number, side: "above" | "below"): string {
    if (!lines || index !== 0) return "";
    const pick =
      side === "above"
        ? lines.slice(Math.max(0, from - 1 - CONTEXT_LINES), Math.max(0, from - 1))
        : lines.slice(to, Math.min(lines.length, to + CONTEXT_LINES));
    // Trim leading/trailing blank lines but keep internal ones — paragraph
    // breaks inside the context are part of what it shows.
    let a = 0;
    let b = pick.length;
    while (a < b && pick[a].trim() === "") a++;
    while (b > a && pick[b - 1].trim() === "") b--;
    return pick.slice(a, b).join("\n");
  }

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
        {@const above = contextFor(region.from, region.to, "above")}
        {@const below = contextFor(region.from, region.to, "below")}
        <article class="pair">
          <div class="pair-head">
            <span class="kind {region.kind}">{region.kind}</span>
            <span class="lines">lines {region.from}–{region.to}</span>
          </div>

          <div class="columns" class:single={!region.before || !region.after}>
            <div class="pane before" class:blank={!region.before}>
              <span class="pane-label">Before</span>
              {#if above}<p class="ctx">{above}</p>{/if}
              {#if region.before}
                <p class="text">{#each ops as op}{#if op.kind === "equal"}{op.text}{:else if op.kind === "delete"}<del>{op.text}</del>{/if}{/each}</p>
              {:else}
                <p class="none">Nothing here before — this passage is new.</p>
              {/if}
              {#if below}<p class="ctx">{below}</p>{/if}
            </div>

            <div class="pane after" class:blank={!region.after}>
              <span class="pane-label">Now</span>
              {#if above}<p class="ctx">{above}</p>{/if}
              {#if region.after}
                <p class="text">{#each ops as op}{#if op.kind === "equal"}{op.text}{:else if op.kind === "insert"}<ins>{op.text}</ins>{/if}{/each}</p>
              {:else}
                <p class="none">Removed.</p>
              {/if}
              {#if below}<p class="ctx">{below}</p>{/if}
            </div>
          </div>
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
    background: color-mix(in srgb, var(--fg) 28%, transparent);
    backdrop-filter: blur(2px);
    animation: fade 140ms ease both;
  }
  .sheet {
    position: fixed;
    z-index: 41;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(1180px, 92vw);
    /* Roughly two thirds of the window: enough for two paragraphs of prose
       side by side with their context, while the page behind stays visible
       as the thing this is describing. */
    height: min(70vh, 860px);
    display: flex;
    flex-direction: column;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, .28), var(--shadow-md);
    animation: rise 180ms cubic-bezier(.2, .7, .3, 1) both;
    overflow: hidden;
  }
  @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes rise {
    from { opacity: 0; transform: translate(-50%, -50%) scale(.985); }
    to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .scrim, .sheet { animation: none; }
  }

  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: .75rem 1rem .65rem;
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

  .body { overflow-y: auto; padding: 1rem 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 1.4rem; flex: 1 1 auto; }
  .empty { margin: 2rem auto; color: var(--muted); font-size: 13px; max-width: 46ch; text-align: center; }

  .pair { display: flex; flex-direction: column; gap: .5rem; }
  .pair-head { display: flex; align-items: baseline; gap: .5rem; }
  .kind {
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: .07em;
    font-weight: 700;
    padding: .1rem .35rem;
    border-radius: 4px;
    color: var(--bg);
    background: var(--changed, #d99a1e);
  }
  .kind.added { background: var(--ok, #3f9a5a); }
  .kind.removed { background: var(--danger, #b4453f); }
  .lines { font-size: 10.5px; color: var(--muted); font-family: ui-monospace, Menlo, Consolas, monospace; }

  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: .9rem;
    align-items: start;
  }
  /* Narrow windows: fall back to stacked so neither column becomes a ribbon. */
  @media (max-width: 760px) {
    .columns { grid-template-columns: 1fr; }
  }

  .pane {
    border-radius: 10px;
    padding: .6rem .8rem .7rem;
    background: color-mix(in srgb, var(--bg) 70%, var(--bg-elevated));
    border: 1px solid var(--border);
    min-width: 0;
  }
  .pane.before { border-top: 3px solid color-mix(in srgb, var(--danger, #b4453f) 70%, transparent); }
  .pane.after  { border-top: 3px solid color-mix(in srgb, var(--ok, #3f9a5a) 70%, transparent); }
  .pane.blank { opacity: .75; }
  .pane-label {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--muted);
    margin-bottom: .35rem;
  }
  .text, .ctx, .none {
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
  .ctx {
    color: var(--muted);
    opacity: .75;
    font-size: 12.5px;
  }
  .ctx + .text, .text + .ctx, .ctx + .none, .none + .ctx { margin-top: .55rem; }
  .none { color: var(--muted); font-style: italic; }
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
</style>
