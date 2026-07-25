<script lang="ts">
  import {
    settings,
    PANEL_WIDTH_MIN,
    PANEL_WIDTH_MAX,
    PANEL_SPLIT_MIN,
    PANEL_SPLIT_MAX,
  } from "./settings-store.svelte";
  import Toc from "./Toc.svelte";
  import FileBrowser from "./FileBrowser.svelte";

  interface Props {
    source: string;
    cwd: string | null;
    activePath: string | null;
    onOpenFile: (path: string) => void;
  }
  let { source, cwd, activePath, onOpenFile }: Props = $props();

  /** Double-click targets — same numbers as the store defaults. */
  const WIDTH_RESET = 280;
  const SPLIT_RESET = 0.45;
  /** Retract delay while peeking. Long enough that a diagonal mouse path from
   *  the screen edge to the pane doesn't clip a corner and lose the overlay. */
  const PEEK_GRACE_MS = 280;

  let anyVisible = $derived(settings.s.showFiles || settings.s.showToc);
  let bothVisible = $derived(settings.s.showFiles && settings.s.showToc);
  let collapsed = $derived(settings.s.panelCollapsed);

  let widthDragging = $state(false);
  let splitDragging = $state(false);
  let stackEl = $state<HTMLElement | null>(null);

  const clampWidth = (n: number) =>
    Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, Math.round(n)));
  // Rounded to whole percent: finer than that is invisible and only bloats
  // settings.json with 17-digit floats.
  const clampSplit = (n: number) =>
    Math.round(Math.min(PANEL_SPLIT_MAX, Math.max(PANEL_SPLIT_MIN, n)) * 100) / 100;

  /**
   * Shared drag plumbing for both dividers.
   *
   * Pointer capture is the point: with plain window listeners a fast drag that
   * crosses into the webview's native chrome (or an embedded editor iframe)
   * silently stops delivering `pointermove` and the divider sticks to the
   * cursor. Capturing on the divider itself keeps the stream intact until the
   * pointer is released.
   */
  function beginDrag(
    e: PointerEvent,
    onMove: (ev: PointerEvent) => void,
    onEnd: () => void,
  ) {
    // Deliberately *not* preventDefault(): the default pointerdown action is
    // what focuses the divider (so arrow keys work right after a drag) and what
    // lets the dblclick-to-reset gesture through. Stray text selection is
    // handled with `user-select: none` in CSS instead.
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const finish = (ev: PointerEvent) => {
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {
        // Already released (pointercancel) — nothing to undo.
      }
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", finish);
      el.removeEventListener("pointercancel", finish);
      onEnd();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", finish);
  }

  // ─── Pane width ──────────────────────────────────────────────────────
  function startWidthDrag(e: PointerEvent) {
    const startX = e.clientX;
    const startWidth = settings.s.panelWidth;
    widthDragging = true;
    beginDrag(
      e,
      (ev) => settings.set("panelWidth", clampWidth(startWidth + (ev.clientX - startX))),
      () => (widthDragging = false),
    );
  }

  function onWidthKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 32 : 8;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = settings.s.panelWidth - step;
    else if (e.key === "ArrowRight") next = settings.s.panelWidth + step;
    else if (e.key === "Home") next = PANEL_WIDTH_MIN;
    else if (e.key === "End") next = PANEL_WIDTH_MAX;
    else if (e.key === "Enter" || e.key === " ") next = WIDTH_RESET;
    if (next === null) return;
    e.preventDefault();
    settings.set("panelWidth", clampWidth(next));
  }

  // ─── Files / Outline split ───────────────────────────────────────────
  function startSplitDrag(e: PointerEvent) {
    // A divider with nothing on one side of it is meaningless.
    if (!bothVisible || !stackEl) return;
    const rect = stackEl.getBoundingClientRect();
    const gutter = (e.currentTarget as HTMLElement).offsetHeight;
    const usable = rect.height - gutter;
    if (usable <= 0) return;
    splitDragging = true;
    beginDrag(
      e,
      (ev) =>
        settings.set(
          "panelSplit",
          clampSplit((ev.clientY - rect.top - gutter / 2) / usable),
        ),
      () => (splitDragging = false),
    );
  }

  function onSplitKey(e: KeyboardEvent) {
    if (!bothVisible) return;
    const step = e.shiftKey ? 0.08 : 0.02;
    let next: number | null = null;
    if (e.key === "ArrowUp") next = settings.s.panelSplit - step;
    else if (e.key === "ArrowDown") next = settings.s.panelSplit + step;
    else if (e.key === "Home") next = PANEL_SPLIT_MIN;
    else if (e.key === "End") next = PANEL_SPLIT_MAX;
    else if (e.key === "Enter" || e.key === " ") next = SPLIT_RESET;
    if (next === null) return;
    e.preventDefault();
    settings.set("panelSplit", clampSplit(next));
  }

  // ─── Collapsed hover-peek ────────────────────────────────────────────
  let peeking = $state(false);
  let peekTimer: ReturnType<typeof setTimeout> | null = null;

  /** The overlay stays mounted so retracting can animate; this gates it. */
  let peekEnabled = $derived(collapsed && settings.s.panelHoverPeek && anyVisible);

  function cancelRetract() {
    if (peekTimer) {
      clearTimeout(peekTimer);
      peekTimer = null;
    }
  }
  function openPeek() {
    cancelRetract();
    peeking = true;
  }
  function scheduleRetract() {
    cancelRetract();
    peekTimer = setTimeout(() => {
      peekTimer = null;
      peeking = false;
    }, PEEK_GRACE_MS);
  }
  function dock() {
    cancelRetract();
    peeking = false;
    settings.set("panelCollapsed", false);
  }

  /**
   * A section's × button. Hiding the *last* visible section collapses the pane
   * rather than leaving a nominally-open panel with nothing in it — which would
   * also desync the toolbar's toggle, since that reads `panelCollapsed`.
   * Mirrors `revealSection()` in +page.svelte, from the other direction.
   */
  function hideSection(key: "showFiles" | "showToc") {
    const other = key === "showFiles" ? "showToc" : "showFiles";
    settings.set(key, false);
    if (!settings.s[other]) settings.set("panelCollapsed", true);
  }

  // Expanding the pane (or turning peek off) must not leave a stale overlay
  // floating over the document.
  $effect(() => {
    if (!peekEnabled && peeking) {
      cancelRetract();
      peeking = false;
    }
  });

  $effect(() => () => cancelRetract());
</script>

<!-- The Files/Outline stack is identical whether it's docked or peeking, so it
     lives in one snippet; only one branch below is ever in the DOM at a time. -->
{#snippet stack()}
  <div class="panel-stack" bind:this={stackEl}>
    {#if settings.s.showFiles}
      <section
        class="section files-section"
        style={bothVisible ? `flex: ${settings.s.panelSplit} 1 0%` : "flex: 1 1 auto"}
      >
        <header class="section-head">
          <span class="title">Files</span>
          <button class="hide" onclick={() => hideSection("showFiles")} title="Hide files">×</button>
        </header>
        <div class="section-body">
          <FileBrowser {cwd} {activePath} onOpen={onOpenFile} />
        </div>
      </section>
    {/if}

    {#if bothVisible}
      <!-- ARIA treats a *focusable* separator as a widget (that's what the
           aria-value* trio is for), but svelte-check classifies the role as
           non-interactive unconditionally, so both warnings here are false
           positives. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="split-divider"
        class:dragging={splitDragging}
        role="separator"
        tabindex="0"
        aria-orientation="horizontal"
        aria-label="Resize Files and Outline"
        aria-valuenow={Math.round(settings.s.panelSplit * 100)}
        aria-valuemin={Math.round(PANEL_SPLIT_MIN * 100)}
        aria-valuemax={Math.round(PANEL_SPLIT_MAX * 100)}
        onpointerdown={startSplitDrag}
        ondblclick={() => settings.set("panelSplit", SPLIT_RESET)}
        onkeydown={onSplitKey}
        title="Drag to resize · double-click to reset"
      >
        <span class="grip" aria-hidden="true"></span>
      </div>
    {/if}

    {#if settings.s.showToc}
      <section
        class="section toc-section"
        style={bothVisible ? `flex: ${1 - settings.s.panelSplit} 1 0%` : "flex: 1 1 auto"}
      >
        <header class="section-head">
          <span class="title">Outline</span>
          <button class="hide" onclick={() => hideSection("showToc")} title="Hide outline">×</button>
        </header>
        <div class="section-body">
          <Toc {source} />
        </div>
      </section>
    {/if}
  </div>
{/snippet}

{#if anyVisible}
  <!-- The host is always a flex child of `.body`, which gives the peek overlay
       a positioning context that already matches the content area's height.
       Collapsed it is literally zero-width, so the layout reflows as if the
       pane didn't exist. -->
  <div
    class="panel-host"
    class:collapsed
    style={collapsed ? undefined : `width: ${settings.s.panelWidth}px`}
  >
    {#if !collapsed}
      <aside class="panel docked">
        {@render stack()}
        <!-- Same false positives as the split divider above. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="width-resizer"
          class:dragging={widthDragging}
          role="separator"
          tabindex="0"
          aria-orientation="vertical"
          aria-label="Resize panel width"
          aria-valuenow={settings.s.panelWidth}
          aria-valuemin={PANEL_WIDTH_MIN}
          aria-valuemax={PANEL_WIDTH_MAX}
          onpointerdown={startWidthDrag}
          ondblclick={() => settings.set("panelWidth", WIDTH_RESET)}
          onkeydown={onWidthKey}
          title="Drag to resize · double-click to reset"
        >
          <span class="grip" aria-hidden="true"></span>
        </div>
      </aside>
    {:else if peekEnabled}
      <!-- Invisible trigger on the window's left edge. -->
      <div
        class="peek-strip"
        onpointerenter={openPeek}
        onpointerleave={scheduleRetract}
        aria-hidden="true"
      ></div>

      <aside
        class="panel peek"
        class:open={peeking}
        style={`width: ${settings.s.panelWidth}px`}
        onpointerenter={cancelRetract}
        onpointerleave={scheduleRetract}
        onfocusin={cancelRetract}
        onfocusout={scheduleRetract}
      >
        <div class="peek-bar">
          <span class="peek-hint">Side panel</span>
          <button class="pin" onclick={dock} title="Keep the panel open (Ctrl+B)">Keep open</button>
        </div>
        {@render stack()}
      </aside>
    {/if}
  </div>
{/if}

<style>
  .panel-host {
    position: relative;
    flex-shrink: 0;
    display: flex;
    height: 100%;
    min-width: 0;
  }
  .panel-host.collapsed {
    width: 0;
    /* The overlay and its hover strip have to escape a zero-width host. */
    overflow: visible;
  }

  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    background: var(--side-bg);
  }
  .panel.docked {
    position: relative;
    width: 100%;
    border-right: 1px solid var(--border);
  }

  /* ─── Peek overlay ─────────────────────────────────────────────────── */
  .peek-strip {
    position: absolute;
    left: 0;
    top: 0;
    width: 10px;
    height: 100%;
    z-index: 39;
  }
  .peek {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 40;
    border-right: 1px solid var(--border-strong);
    /* Elevated rather than --side-bg: in dark mode --side-bg equals --bg, and a
       floating pane that matches the page behind it reads as a glitch. */
    background: var(--bg-elevated);
    box-shadow: var(--shadow-md);
    transform: translateX(-101%);
    visibility: hidden;
    pointer-events: none;
    transition: transform 190ms cubic-bezier(.32, .72, 0, 1), visibility 190ms;
  }
  .peek.open {
    transform: none;
    visibility: visible;
    pointer-events: auto;
  }
  .peek-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .5rem;
    padding: .3rem .4rem .3rem .85rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .peek-hint {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .09em;
    font-weight: 600;
    color: var(--muted);
  }
  .pin {
    background: none;
    border: 1px solid var(--border);
    border-radius: 5px;
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
    padding: 3px 6px;
    color: var(--fg);
  }
  .pin:hover { background: var(--hover-bg); border-color: var(--border-strong); }
  .pin:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

  /* ─── Sections ─────────────────────────────────────────────────────── */
  .panel-stack {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    overflow: hidden;
  }
  .section {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .5rem .5rem .3rem .85rem;
    flex-shrink: 0;
  }
  .title {
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--muted);
  }
  .hide {
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    font-size: 14px;
    line-height: 1;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: .7;
  }
  .hide:hover { background: var(--hover-bg); color: var(--fg-strong); opacity: 1; }
  .hide:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
  .section-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .section-body :global(.toc),
  .section-body :global(.file-browser) {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
  }

  /* ─── Dividers ─────────────────────────────────────────────────────── */
  /* Both dividers use the same idiom: a generous invisible hit area with a
     hairline `.grip` that only materialises on hover/drag, so the chrome stays
     quiet until you reach for it. */
  .split-divider {
    position: relative;
    /* Fixed 8px gutter, so the drag maths can subtract a known constant from
       the stack height instead of guessing at overflow. */
    flex: 0 0 8px;
    cursor: row-resize;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    touch-action: none;
  }
  .split-divider .grip {
    display: block;
    width: 100%;
    height: 1px;
    background: var(--border);
    transition: background-color 110ms ease, height 110ms ease;
  }
  .split-divider:hover .grip,
  .split-divider:focus-visible .grip,
  .split-divider.dragging .grip {
    height: 2px;
    background: var(--accent);
  }
  .split-divider:focus-visible { outline: none; }

  .width-resizer {
    position: absolute;
    top: 0;
    right: -4px;
    width: 9px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
    display: flex;
    align-items: stretch;
    justify-content: center;
    user-select: none;
    touch-action: none;
  }
  .width-resizer .grip {
    display: block;
    width: 1px;
    background: transparent;
    transition: background-color 110ms ease, width 110ms ease;
  }
  .width-resizer:hover .grip,
  .width-resizer:focus-visible .grip,
  .width-resizer.dragging .grip {
    width: 2px;
    background: var(--accent);
  }
  .width-resizer:focus-visible { outline: none; }

  @media (prefers-reduced-motion: reduce) {
    .peek { transition: none; }
    .split-divider .grip, .width-resizer .grip { transition: none; }
  }
</style>
