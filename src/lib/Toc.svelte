<script lang="ts">
  import { parseHeadings, activeHeadingIndex, type Heading } from "$lib/outline";
  import { viewNav } from "$lib/view-nav.svelte";
  import { contextMenu, type MenuEntry } from "$lib/context-menu.svelte";
  import { copyText } from "$lib/platform";

  interface Props { source: string }
  let { source = "" }: Props = $props();

  // The shared parser is the single source of truth for heading ids: it dedupes
  // slugs exactly the way post-render.ts does, so a document with two "Notes"
  // headings still links to the right anchors.
  let headings = $derived(parseHeadings(source));

  // Documents rarely start at h1 (many begin at h2), so indentation and weight
  // are keyed off depth *relative to the shallowest heading present* rather
  // than the raw level. Otherwise an all-h2 document renders fully indented
  // and uniformly small.
  let minLevel = $derived(
    headings.length === 0 ? 1 : headings.reduce((m, h) => Math.min(m, h.level), 6),
  );

  // `readingLine` tracks the block sitting on the reading line (mid-viewport,
  // ramped to the edges at the two ends of the document), which moves
  // continuously as the reader scrolls; `activeLine` only changes when a
  // heading crosses it. Preferring readingLine is what makes the highlight
  // travel through long sections instead of sticking until the next heading
  // arrives — and what puts the last section under the mark at the bottom.
  let activeIdx = $derived(
    activeHeadingIndex(headings, viewNav.readingLine ?? viewNav.activeLine),
  );

  let rootEl = $state<HTMLElement | null>(null);
  let listEl = $state<HTMLElement | null>(null);
  /** Pointer is over the outline — never yank the list out from under it. */
  let hovering = $state(false);
  /** Wall-clock of the last deliberate wheel inside the outline. */
  let userActiveAt = $state(0);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Attached imperatively: these are scroll-following heuristics, not user
  // interactions, and putting mouse handlers on the markup would only earn a
  // spurious a11y warning on an element that isn't a control.
  $effect(() => {
    const el = rootEl;
    if (!el) return;
    const enter = () => (hovering = true);
    const leave = () => (hovering = false);
    const wheel = () => (userActiveAt = Date.now());
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("wheel", wheel);
    };
  });

  // Follow the reading position, but only nudge: `block: "nearest"` leaves the
  // list alone while the active row is already on screen, which keeps the
  // outline from twitching on every scroll tick.
  $effect(() => {
    const idx = activeIdx;
    if (idx < 0 || !listEl) return;
    if (hovering) return;
    if (Date.now() - userActiveAt < 1500) return;
    const row = listEl.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  });

  function jump(line: number, id: string) {
    // Line-based jumps survive duplicate heading text; the slug is only a
    // fallback for when no Viewer is mounted (edit mode).
    viewNav.jumpToLine(line, id);
  }

  function headingMenu(h: Heading): MenuEntry[] {
    return [
      { label: "Jump to section", icon: "chevron-right", action: () => jump(h.line, h.id) },
      { separator: true },
      { label: "Copy heading text", icon: "copy", action: () => copyText(h.text) },
      // The slug now matches GitHub's, so this pastes into a document and
      // actually resolves — which it never did before v0.7.0.
      { label: "Copy link to section", icon: "link", action: () => copyText(`#${h.id}`) },
    ];
  }
</script>

<div class="toc" bind:this={rootEl}>
  <!-- Reading-progress rail: a 2px scrubber pinned to the section edge. It
       lives outside the scroller so it reads as document progress, not list
       progress. -->
  <div class="rail" aria-hidden="true">
    <div class="rail-fill" style="height: {Math.round(viewNav.progress * 1000) / 10}%"></div>
  </div>

  {#if headings.length === 0}
    <div class="toc-empty">No headings</div>
  {:else}
    <nav class="list" bind:this={listEl} aria-label="Document outline">
      {#each headings as h (h.index)}
        <button
          class="row d{Math.min(h.level - minLevel, 3)}"
          class:active={h.index === activeIdx}
          class:above={h.index < activeIdx}
          style="--depth: {Math.min(h.level - minLevel, 5)}"
          data-idx={h.index}
          aria-current={h.index === activeIdx ? "location" : undefined}
          title={h.text}
          onclick={() => jump(h.line, h.id)}
          oncontextmenu={(e) => contextMenu.open(e, headingMenu(h))}
        >
          <!-- The pill is a child rather than the button's own background so it
               can start at the indent guide instead of the pane edge — that's
               what makes the active row's depth readable at a glance. -->
          <span class="pill"><span class="label">{h.text}</span></span>
        </button>
      {/each}
    </nav>
  {/if}
</div>

<style>
  .toc {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* Clears the progress rail and lines the level-0 guide up with the section
       header's text, so the whole pane shares one left margin. */
    padding-left: 9px;
  }

  .rail {
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 2px;
    border-radius: 1px;
    background: var(--border);
    overflow: hidden;
  }
  .rail-fill {
    width: 100%;
    background: var(--accent);
    opacity: .5;
    border-radius: 1px;
    transition: height 120ms linear;
  }

  .list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: .25rem .5rem 1rem 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .toc-empty {
    color: var(--muted);
    font-style: italic;
    padding: .6rem .65rem;
    font-size: 11.5px;
  }

  .row {
    position: relative;
    display: block;
    width: 100%;
    background: none;
    border: 0;
    cursor: pointer;
    text-align: left;
    font: inherit;
    /* Depth is expressed as indentation *plus* a guide line (see ::before);
       raw padding alone made deep outlines read as a shapeless ragged edge. */
    padding: 0 8px 0 calc(var(--depth) * 11px);
    color: var(--muted-strong);
    transition: color 90ms ease;
  }
  /* One guide segment per row, sitting exactly on the pill's left edge.
     Consecutive rows at the same depth stack into a continuous vertical line,
     and the same element doubles as the active accent bar — so the indicator is
     always precisely where the eye expects it. */
  .row::before {
    content: "";
    position: absolute;
    left: calc(var(--depth) * 11px);
    top: 2px;
    bottom: 2px;
    width: 2px;
    border-radius: 1px;
    background: var(--border);
    opacity: 0;
    transition: opacity 90ms ease, background-color 90ms ease;
    z-index: 1;
  }
  .row:not(.d0)::before { opacity: .85; }

  .pill {
    display: block;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background-color 90ms ease, box-shadow 90ms ease;
  }
  .label {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Level-aware typography: top-level entries carry the document's structure,
     deeper ones recede so the shape is legible at a glance. */
  .row.d0 {
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: -.005em;
    color: var(--fg);
    line-height: 1.45;
  }
  .row.d1 {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted-strong);
    line-height: 1.4;
  }
  .row.d2 {
    font-size: 11.5px;
    font-weight: 450;
    color: var(--muted-strong);
    line-height: 1.4;
  }
  .row.d3 {
    font-size: 11px;
    font-weight: 400;
    color: var(--muted);
    line-height: 1.4;
  }

  /* Already-read entries dim slightly, so the highlight sits at the boundary
     between "behind me" and "ahead of me". Opacity rather than a colour keeps
     it correct in all three palettes. */
  .row.above:not(.active) { opacity: .62; }

  .row:hover { color: var(--fg-strong); opacity: 1; }
  .row:hover .pill { background: var(--hover-bg); }
  .row:hover::before { background: var(--border-strong); opacity: 1; }
  .row:active .pill { background: var(--accent-soft); }
  .row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    border-radius: 6px;
  }

  .row.active { color: var(--fg-strong); }
  .row.active .pill {
    /* A dedicated fill rather than --accent-soft: at 12–18% the soft tint is
       nearly invisible on a dark surface. An earlier pass added a 1px accent
       ring to compensate, but a fully-ringed rounded rect reads as a text
       input, not as "you are here" — the row needs a band, not a control.
       --accent-active is defined per-theme in +page.svelte. */
    background: var(--accent-active);
  }
  .row.active::before {
    background: var(--accent);
    opacity: 1;
  }
  .row.active.d0 { font-weight: 650; }

  @media (prefers-reduced-motion: reduce) {
    .row, .row::before, .pill, .rail-fill { transition: none; }
  }
</style>
