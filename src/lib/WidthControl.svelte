<script lang="ts">
  /**
   * Content-width control.
   *
   * The previous version of this control showed a bare `86ch` badge, which
   * told you a number without telling you what it did. This one shows the
   * thing itself: a miniature page with lines of text on it, where the text
   * block grows and shrinks exactly as the real content column does. You read
   * the current state at a glance and the mapping to the ‹ › buttons is
   * self-evident — no unit vocabulary required.
   *
   * Three ways to drive it, in ascending order of precision: the buttons
   * (8ch steps), dragging across the page glyph, and the wheel. The numeric
   * value is still available, but only on hover/interaction, where it informs
   * rather than clutters.
   *
   * v0.6.0+.
   */
  import { settings, WIDTH_MIN, WIDTH_DEFAULT, widthMax, bumpWidth } from "./settings-store.svelte";
  import { sk } from "./platform";

  let dragging = $state(false);
  let hovering = $state(false);
  let glyphEl: HTMLDivElement | null = $state(null);

  /** Fraction of the page glyph the text column should occupy. Anchored so
   *  WIDTH_MIN reads as a visibly narrow column and full width fills the page,
   *  rather than mapping 40..160ch onto 25%..100% (which would make the
   *  default look nearly full-width and the control feel dead at the top end). */
  let fraction = $derived.by(() => {
    if (settings.s.fullWidth) return 1;
    const t = (settings.s.contentWidthCh - WIDTH_MIN) / (widthMax() - WIDTH_MIN);
    return 0.3 + Math.min(1, Math.max(0, t)) * 0.65;
  });

  let label = $derived(
    settings.s.fullWidth ? "Full window width" : `${settings.s.contentWidthCh} characters per line`,
  );

  function setWidth(ch: number) {
    const next = Math.min(widthMax(), Math.max(WIDTH_MIN, Math.round(ch)));
    if (settings.s.fullWidth) settings.set("fullWidth", false);
    settings.set("contentWidthCh", next);
  }

  function bump(delta: number) {
    bumpWidth(delta);
  }

  /** Map a pointer position across the glyph to a width. The glyph is a page
   *  seen head-on, so horizontal distance from its centre is the natural
   *  handle: half-width out from the middle == the column's half-width. */
  function widthFromPointer(clientX: number): number {
    if (!glyphEl) return settings.s.contentWidthCh;
    const rect = glyphEl.getBoundingClientRect();
    const half = rect.width / 2;
    if (half <= 0) return settings.s.contentWidthCh;
    const offset = Math.abs(clientX - (rect.left + half)) / half; // 0 centre → 1 edge
    const t = Math.min(1, Math.max(0, (offset - 0.3) / 0.65));
    return WIDTH_MIN + t * (widthMax() - WIDTH_MIN);
  }

  function onGlyphPointerDown(e: PointerEvent) {
    e.preventDefault();
    glyphEl?.setPointerCapture(e.pointerId);
    dragging = true;
    setWidth(widthFromPointer(e.clientX));
  }

  function onGlyphPointerMove(e: PointerEvent) {
    if (!dragging) return;
    setWidth(widthFromPointer(e.clientX));
  }

  function endDrag(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try { glyphEl?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    bump(e.deltaY > 0 ? -2 : 2);
  }

  function onGlyphKey(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") { e.preventDefault(); bump(-4); }
    else if (e.key === "ArrowRight") { e.preventDefault(); bump(4); }
    else if (e.key === "Home") { e.preventDefault(); setWidth(WIDTH_MIN); }
    else if (e.key === "End") { e.preventDefault(); setWidth(widthMax()); }
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      settings.set("fullWidth", !settings.s.fullWidth);
    }
  }
</script>

<div
  class="width-control"
  class:dragging
  role="group"
  aria-label="Content width"
  title={`Content width — ${label}. Drag or scroll the page, or use ${sk("Mod", "[")} / ${sk("Mod", "]")} · ${sk("Mod", "\\")} for full width`}
  onpointerenter={() => (hovering = true)}
  onpointerleave={() => (hovering = false)}
>
  <button class="step" onclick={() => bump(-8)} aria-label="Narrower content" title={`Narrower (${sk("Mod", "[")})`}>‹</button>

  <div
    class="glyph"
    class:full={settings.s.fullWidth}
    bind:this={glyphEl}
    onpointerdown={onGlyphPointerDown}
    onpointermove={onGlyphPointerMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    ondblclick={() => setWidth(WIDTH_DEFAULT)}
    onwheel={onWheel}
    onkeydown={onGlyphKey}
    role="slider"
    tabindex="0"
    aria-label="Content width in characters per line"
    aria-valuemin={WIDTH_MIN}
    aria-valuemax={widthMax()}
    aria-valuenow={settings.s.fullWidth ? widthMax() : settings.s.contentWidthCh}
    aria-valuetext={label}
    style="--frac: {fraction}"
  >
    <span class="margin-guide left" aria-hidden="true"></span>
    <span class="margin-guide right" aria-hidden="true"></span>
    <span class="column" aria-hidden="true">
      <i></i><i></i><i></i><i class="short"></i>
    </span>
  </div>

  <button class="step" onclick={() => bump(8)} aria-label="Wider content" title={`Wider (${sk("Mod", "]")})`}>›</button>

  <button
    class="full-toggle"
    class:active={settings.s.fullWidth}
    onclick={() => settings.set("fullWidth", !settings.s.fullWidth)}
    title={`Fill the window (${sk("Mod", "\\")})`}
    aria-label="Toggle full window width"
    aria-pressed={settings.s.fullWidth}
  >⤢</button>

  {#if hovering || dragging}
    <span class="readout" role="status">
      {settings.s.fullWidth ? "Full" : `${settings.s.contentWidthCh}ch`}
    </span>
  {/if}
</div>

<style>
  .width-control {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: var(--muted-bg);
    border-radius: 7px;
    padding: 2px 3px;
  }

  .step {
    border: 0;
    height: 22px;
    width: 18px;
    padding: 0;
    font-size: 13px;
    color: var(--muted-strong);
    border-radius: 5px;
    background: transparent;
  }
  .step:hover { background: var(--hover-bg); color: var(--fg); }

  /* ─── The page ────────────────────────────────────────────────────────
     A window seen head-on. The stack of rules inside is the text column;
     its width is the setting. Reads as "this is how wide your text is". */
  .glyph {
    position: relative;
    width: 38px;
    height: 22px;
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ew-resize;
    overflow: hidden;
    flex-shrink: 0;
  }
  .glyph:hover { border-color: var(--accent); }
  .dragging .glyph { border-color: var(--accent); }

  /* Faint hairlines where the margins fall — they make the column's edges
     legible even when it nearly fills the page. */
  .margin-guide {
    position: absolute;
    top: 2px;
    bottom: 2px;
    width: 1px;
    background: var(--border);
    opacity: .9;
    transition: left 140ms ease, right 140ms ease, opacity 140ms ease;
  }
  .margin-guide.left { left: calc(50% - (var(--frac) * 50%)); }
  .margin-guide.right { right: calc(50% - (var(--frac) * 50%)); }
  .glyph.full .margin-guide { opacity: 0; }

  .column {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2.5px;
    width: calc(var(--frac) * 100%);
    padding: 0 1px;
    transition: width 140ms cubic-bezier(.3, 0, .2, 1);
  }
  .column i {
    display: block;
    height: 1.5px;
    border-radius: 1px;
    background: var(--muted);
    opacity: .75;
  }
  .column i.short { width: 62%; }
  .glyph:hover .column i,
  .dragging .column i { background: var(--accent); opacity: .85; }

  .full-toggle {
    border: 0;
    height: 22px;
    width: 20px;
    padding: 0;
    margin-left: 1px;
    font-size: 11px;
    color: var(--muted-strong);
    border-radius: 5px;
    background: transparent;
  }
  .full-toggle:hover { background: var(--hover-bg); color: var(--fg); }
  .full-toggle.active {
    background: var(--bg);
    color: var(--fg-strong);
    box-shadow: var(--shadow-sm);
  }
  :global(html[data-theme="dark"]) .full-toggle.active { background: var(--border-strong); }

  /* The number, on demand only — visible while the pointer is on the control
     or a drag is in flight, and gone the rest of the time. */
  .readout {
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 6px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: var(--shadow-sm);
    font-size: 10.5px;
    color: var(--muted-strong);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
    z-index: 40;
  }

  @media (prefers-reduced-motion: reduce) {
    .column, .margin-guide { transition: none; }
  }
</style>
