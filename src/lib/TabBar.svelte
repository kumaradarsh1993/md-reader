<script lang="ts">
  import { tabs, tabName, type Tab } from "./tabs-store.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import Icon from "./Icon.svelte";
  import { contextMenu, type MenuEntry } from "./context-menu.svelte";
  import { isMac, sk, copyText, revealInFileManager } from "./platform";
  import {
    type TabRect,
    gapOf,
    targetIndex,
    slideFor,
    restingDx,
    autoScrollStep,
    isTearOut,
  } from "./tab-drag";

  interface Props {
    onNewTab: () => void;
  }
  let { onNewTab }: Props = $props();

  /**
   * Hover tooltip for the tab's full path.
   *
   * The native `title` attribute was doing this job and doing it badly: the OS
   * tooltip is a black box with white text drawn by the platform, so it
   * ignores the app's theme entirely and looks like a stray Windows control
   * sitting on a cream page. It also can't wrap a long path sensibly. This is
   * the same information, drawn by the app.
   *
   * `position: fixed` off the hovered tab's own rect, because the tab strip is
   * a horizontal scroller — an absolutely-positioned tooltip inside it would
   * be clipped by the very overflow that makes the strip work.
   */
  let hint = $state<{ dir: string; name: string; x: number; y: number } | null>(null);
  let hintTimer: ReturnType<typeof setTimeout> | null = null;

  function showHint(e: PointerEvent, t: Tab) {
    if (drag || pending) return;
    const el = e.currentTarget as HTMLElement;
    if (hintTimer) clearTimeout(hintTimer);
    // A short delay, so sweeping the pointer across the strip doesn't strobe.
    hintTimer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      hint = {
        dir: t.path.replace(/[\/][^\/]*$/, ""),
        name: tabName(t.path),
        x: Math.min(r.left, window.innerWidth - 340),
        y: r.bottom + 6,
      };
    }, 450);
  }

  function hideHint() {
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = null;
    hint = null;
  }

  // ─── Dragging ──────────────────────────────────────────────────────────
  //
  // Pointer events, not HTML5 drag-and-drop. `tab-drag.ts` carries the whole
  // explanation of why — briefly: the window has an OS-level file-drop target
  // installed so that dropping a `.md` on it opens the file, and while that is
  // installed the webview never delivers `dragover`/`drop` to the page. The old
  // implementation therefore had working tear-out and dead reordering.

  /** Movement, in px, before a press becomes a drag rather than a click. */
  const DRAG_SLOP = 5;
  /** How long the released tab takes to settle into its new slot. */
  const SETTLE_MS = 150;

  let strip = $state<HTMLElement | null>(null);

  /** A press that has not yet travelled far enough to count as a drag. */
  let pending: { id: string; x: number; y: number; pointerId: number } | null = null;

  interface DragState {
    id: string;
    from: number;
    to: number;
    dx: number;
    rects: TabRect[];
    gap: number;
    startX: number;
    startScroll: number;
    /** Pointer is far enough below/above the strip that release detaches. */
    tearArmed: boolean;
    /** True while the released tab animates home; transforms must not change. */
    settling: boolean;
  }
  let drag = $state<DragState | null>(null);

  /** Set when a press turned into a drag, so the trailing `click` is ignored. */
  let suppressClick = false;

  let pointerX = 0;
  let pointerY = 0;
  let scrollRaf: number | null = null;
  /** Pending commit of a released drag, so a new one can force it through. */
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let settleCommit: (() => void) | null = null;

  function tabEls(): HTMLElement[] {
    if (!strip) return [];
    return Array.from(strip.querySelectorAll<HTMLElement>(".tab"));
  }

  function onPointerDown(e: PointerEvent, t: Tab) {
    // Left button only; the close button and the context menu own their own
    // gestures and must not be able to start a drag.
    if (e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest(".close")) return;
    hideHint();
    flushSettle();
    // Cleared at the *start* of every press rather than when a click is
    // consumed: a drag can end without any click following it (Escape, a
    // tear-out, a released capture), and a `true` left over from one of those
    // would silently swallow the next ordinary click on some other tab.
    suppressClick = false;
    pointerX = e.clientX;
    pointerY = e.clientY;
    pending = { id: t.id, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    // Capture up front so the drag survives the pointer leaving the tab — which
    // it does immediately, because the tab slides out from under it.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  /** `startX` is the point the press began at, not the point where the slop
   *  threshold was crossed — passing it in is what stops the tab jumping
   *  DRAG_SLOP pixels sideways the instant the drag engages. */
  function beginDrag(id: string, startX: number) {
    if (!strip) return;
    const els = tabEls();
    // `offsetLeft`, deliberately, and NOT `getBoundingClientRect()`.
    //
    // A bounding rect is where the browser *paints* the element, so it includes
    // any transform currently applied — and during the 150ms settle animation
    // every tab in the strip is carrying one. Measuring with rects meant that
    // grabbing a second tab before the first had finished landing captured a
    // layout that does not exist, and the drag then dropped the tab several
    // slots away from where it was pointing. `offsetLeft` is the layout
    // position: unaffected by transforms, unaffected by scroll, and free.
    //
    // (The same distinction, for the same reason, as the cached `offsetTop` the
    // Viewer uses for its outline probe.)
    const rects: TabRect[] = els.map((el, i) => ({
      id: tabs.tabs[i]?.id ?? "",
      left: el.offsetLeft,
      width: el.offsetWidth,
    }));
    const from = tabs.tabs.findIndex((t) => t.id === id);
    if (from < 0) return;
    drag = {
      id,
      from,
      to: from,
      dx: 0,
      rects,
      gap: gapOf(rects),
      startX,
      startScroll: strip.scrollLeft,
      tearArmed: false,
      settling: false,
    };
    suppressClick = true;
  }

  function onPointerMove(e: PointerEvent) {
    pointerX = e.clientX;
    pointerY = e.clientY;

    if (pending && !drag) {
      const dist = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
      if (dist < DRAG_SLOP) return;
      beginDrag(pending.id, pending.x);
    }
    if (!drag || drag.settling || !strip) return;
    e.preventDefault();

    update();
    ensureAutoScroll();
  }

  /** Recompute displacement, landing slot and tear-out arming. */
  function update() {
    if (!drag || !strip) return;
    const scrolled = strip.scrollLeft - drag.startScroll;
    drag.dx = pointerX - drag.startX + scrolled;
    drag.to = targetIndex(drag.rects, drag.from, drag.dx);

    const r = strip.getBoundingClientRect();
    drag.tearArmed = tabs.tabs.length > 1 && isTearOut(pointerY, r.top, r.bottom);
  }

  /**
   * Keep the strip scrolling while a tab is held against either edge, so a tab
   * can be dragged to a slot that is currently off-screen. Runs on rAF rather
   * than on pointermove: holding still at the edge has to keep scrolling, and
   * a stationary pointer produces no move events.
   */
  function ensureAutoScroll() {
    if (scrollRaf !== null) return;
    const step = () => {
      scrollRaf = null;
      if (!drag || drag.settling || !strip) return;
      const r = strip.getBoundingClientRect();
      const d = autoScrollStep(
        pointerX,
        r.left,
        r.width,
        strip.scrollLeft,
        strip.scrollWidth,
      );
      if (d !== 0) {
        strip.scrollLeft += d;
        update();
        scrollRaf = requestAnimationFrame(step);
      }
    };
    scrollRaf = requestAnimationFrame(step);
  }

  function onPointerUp(e: PointerEvent) {
    const wasPending = pending;
    pending = null;
    if (!drag) {
      // A plain click: `onclick` handles activation.
      if (wasPending) suppressClick = false;
      return;
    }
    if (drag.settling) return;
    e.preventDefault();

    if (drag.tearArmed) {
      const id = drag.id;
      const t = tabs.tabs.find((x) => x.id === id);
      drag = null;
      if (t) void tearOut(t);
      return;
    }
    settle();
  }

  /** Animate the tab into its slot, then commit the reorder. */
  function settle() {
    if (!drag) return;
    const { from, to, rects, gap } = drag;
    if (from === to) {
      // Nudged and put back where it started. Let the click through, so that a
      // press that wobbles a few pixels still selects the tab — otherwise the
      // strip feels unresponsive to anyone with an unsteady hand or a trackpad.
      drag = null;
      suppressClick = false;
      return;
    }
    // Carry the tab to where it will live *before* touching the array, so the
    // DOM reorder is invisible instead of a one-frame jump back to the origin.
    drag.dx = restingDx(rects, from, to, gap);
    drag.settling = true;
    settleCommit = () => {
      settleTimer = null;
      settleCommit = null;
      // Clearing `drag` and reordering in the same tick keeps the transforms
      // and the array in step — Svelte applies both to one frame.
      drag = null;
      tabs.reorder(from, to);
    };
    settleTimer = setTimeout(() => settleCommit?.(), SETTLE_MS);
  }

  /**
   * Commit a released drag right now instead of waiting out its animation.
   *
   * Called before starting a new drag. Without it, grabbing a second tab
   * during the 150ms landing would measure a strip whose array order is about
   * to change under it, and the queued `reorder` would then fire in the middle
   * of the new gesture and shuffle the tabs a second time.
   */
  function flushSettle() {
    if (settleTimer !== null) clearTimeout(settleTimer);
    settleTimer = null;
    settleCommit?.();
  }

  function cancelDrag() {
    if (!drag) return;
    drag = null;
    pending = null;
  }

  function onPointerCancel() {
    cancelDrag();
    pending = null;
  }

  function onWindowKey(e: KeyboardEvent) {
    // Only while the tab is still in hand. Once it has been released and is
    // animating home the move is already the user's decision, and Escape at
    // that point should not quietly undo it.
    if (e.key === "Escape" && drag && !drag.settling) {
      e.preventDefault();
      cancelDrag();
    }
  }

  /** Per-tab transform while a drag is in flight. */
  function shiftFor(i: number): string {
    if (!drag) return "";
    if (i === drag.from) return `translateX(${drag.dx}px)`;
    return `translateX(${slideFor(drag.rects, drag.from, drag.to, i, drag.gap)}px)`;
  }

  function close(e: MouseEvent, id: string) {
    e.stopPropagation();
    tabs.close(id);
  }

  function onTabClick(id: string) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    tabs.switchTo(id);
  }

  /** Middle-click closes, the way every tabbed app has worked for 20 years. */
  function onAuxClick(e: MouseEvent, t: Tab) {
    if (e.button !== 1) return;
    e.preventDefault();
    tabs.close(t.id);
  }

  async function tearOut(t: Tab) {
    try {
      await invoke("spawn_window", { file: t.path });
      tabs.close(t.id);
    } catch (err) {
      console.error("spawn_window failed", err);
    }
  }

  function closeOthers(id: string) {
    for (const t of [...tabs.tabs]) if (t.id !== id) tabs.close(t.id);
  }

  function closeToRight(id: string) {
    const idx = tabs.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    for (const t of tabs.tabs.slice(idx + 1)) tabs.close(t.id);
  }

  function tabMenu(t: Tab): MenuEntry[] {
    const idx = tabs.tabs.findIndex((x) => x.id === t.id);
    const hasOthers = tabs.tabs.length > 1;
    const hasRight = idx >= 0 && idx < tabs.tabs.length - 1;
    const hasLeft = idx > 0;
    return [
      {
        label: "Close tab",
        icon: "x",
        shortcut: sk("Mod", "W"),
        action: () => tabs.close(t.id),
      },
      { label: "Close other tabs", disabled: !hasOthers, danger: hasOthers, action: () => closeOthers(t.id) },
      { label: "Close tabs to the right", disabled: !hasRight, danger: hasRight, action: () => closeToRight(t.id) },
      { separator: true },
      // Discoverability for the drag gesture: someone who has never thought to
      // try dragging a tab still finds the capability, and the shortcut here is
      // where they learn the keyboard route.
      {
        label: "Move tab left",
        disabled: !hasLeft,
        shortcut: sk("Mod", "Shift", "PgUp"),
        action: () => tabs.reorder(idx, idx - 1),
      },
      {
        label: "Move tab right",
        disabled: !hasRight,
        shortcut: sk("Mod", "Shift", "PgDn"),
        action: () => tabs.reorder(idx, idx + 1),
      },
      { separator: true },
      {
        label: "Open in new window",
        icon: "external-link",
        action: () => tearOut(t),
      },
      { separator: true },
      { label: "Copy file name", icon: "copy", action: () => copyText(tabName(t.path)) },
      { label: "Copy full path", icon: "copy", action: () => copyText(t.path) },
      {
        label: isMac ? "Reveal in Finder" : "Show in folder",
        icon: "folder-open",
        action: () => revealInFileManager(t.path),
      },
    ];
  }

  function barMenu(): MenuEntry[] {
    return [
      { label: "Open file…", icon: "folder-open", shortcut: sk("Mod", "T"), action: onNewTab },
      { separator: true },
      {
        label: "Close all tabs",
        icon: "x",
        danger: tabs.tabs.length > 0,
        disabled: tabs.tabs.length === 0,
        action: () => { for (const t of [...tabs.tabs]) tabs.close(t.id); },
      },
    ];
  }
</script>

<svelte:window onkeydown={onWindowKey} />

{#if tabs.tabs.length > 0}
  <div
    class="tab-bar"
    class:dragging={!!drag}
    bind:this={strip}
    role="tablist"
    tabindex="-1"
    oncontextmenu={(e) => contextMenu.open(e, barMenu())}
  >
    {#each tabs.tabs as t, i (t.id)}
      <div
        role="tab"
        tabindex="0"
        aria-selected={tabs.activeId === t.id}
        class="tab"
        class:active={tabs.activeId === t.id}
        class:dirty={t.dirty}
        class:held={drag?.id === t.id}
        class:settling={drag?.id === t.id && drag.settling}
        class:sliding={!!drag && drag.id !== t.id}
        class:tearing={drag?.id === t.id && drag.tearArmed}
        style:transform={shiftFor(i)}
        onpointerdown={(e) => onPointerDown(e, t)}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerCancel}
        onclick={() => onTabClick(t.id)}
        onauxclick={(e) => onAuxClick(e, t)}
        oncontextmenu={(e) => contextMenu.open(e, tabMenu(t))}
        onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tabs.switchTo(t.id); } }}
        onpointerenter={(e) => showHint(e, t)}
        onpointerleave={hideHint}
      >
        <span class="name">{tabName(t.path)}</span>
        <!-- One slot, two states. An unsaved tab shows a dot that becomes the
             close button on hover — so the affordance costs no extra width and
             the row of tabs isn't a row of ×'s begging to be clicked. -->
        <span class="trailing">
          {#if t.dirty}<span class="dot" title="Unsaved changes"></span>{/if}
          <button class="close" onclick={(e) => close(e, t.id)} aria-label="Close tab" tabindex="-1">
            <Icon name="x" size={12} />
          </button>
        </span>
      </div>
    {/each}
    <button class="new-tab" onclick={onNewTab} title={`New tab (${sk("Mod", "T")})`} aria-label="New tab">
      <Icon name="plus" size={14} />
    </button>
  </div>

  <!-- Only while the gesture has actually crossed into detach range, so it
       reads as an answer to "what happens if I let go here?" rather than as a
       tooltip that follows every drag around. -->
  {#if drag?.tearArmed}
    <div class="tear-hint" role="status">Release to open in a new window</div>
  {/if}

  {#if hint}
    <div class="tab-hint" style="left: {hint.x}px; top: {hint.y}px" role="tooltip">
      <span class="hint-name">{hint.name}</span>
      {#if hint.dir}<span class="hint-dir">{hint.dir}</span>{/if}
    </div>
  {/if}
{/if}

<style>
  /* ─── Tab strip ──────────────────────────────────────────────────────
     Pills on the chrome, not cells in a grid.

     v0.6 drew tabs as full-height flat rectangles separated by 1px rules,
     with the active one filled in the *content* colour and a 2px accent bar
     on top. Three things went wrong with that. The dividers made it read as a
     spreadsheet header. The active tab being content-coloured meant the strip
     and the document blurred into one another — the "tabs mix into the text"
     complaint. And the accent bar was the only strong signal of which tab was
     live, so at a glance the strip looked uniform.

     Pills fix all three: the chip's own surface says "selected", the gaps
     replace the rules, and the strip stays visibly part of the chrome. */
  .tab-bar {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 .45rem;
    height: 38px;
    background: var(--chrome-bg);
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-app-region: no-drag;
    flex-shrink: 0;
    position: relative;
    z-index: 2;
  }
  .tab-bar::-webkit-scrollbar { height: 0; }
  /* Suppress the text I-beam and any accidental selection for the duration of
     a drag — without this, dragging a tab across its neighbours selects their
     filenames and the strip fills with blue. */
  .tab-bar.dragging { cursor: grabbing; }
  .tab-bar.dragging .tab { user-select: none; }

  /* App-drawn replacement for the OS tooltip. Same surface tokens as the
     context menu, so every floating thing in the app is made of one material. */
  .tab-hint {
    position: fixed;
    z-index: 30;
    max-width: 330px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: .35rem .5rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: var(--shadow-md);
    pointer-events: none;
    animation: hint-in 100ms ease both;
  }
  @keyframes hint-in {
    from { opacity: 0; transform: translateY(-2px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .hint-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--fg-strong);
    line-height: 1.4;
  }
  .hint-dir {
    font-size: 10.5px;
    color: var(--muted);
    line-height: 1.45;
    /* The path is the part that can be long. Break it on separators rather
       than truncating: a path you can't read the end of answers nothing. */
    word-break: break-all;
  }

  .tear-hint {
    position: fixed;
    left: 50%;
    top: 46px;
    transform: translateX(-50%);
    z-index: 30;
    padding: .3rem .6rem;
    font-size: 11.5px;
    color: var(--fg-strong);
    background: var(--bg-elevated);
    border: 1px solid var(--accent);
    border-radius: 999px;
    box-shadow: var(--shadow-md);
    pointer-events: none;
    animation: hint-in 100ms ease both;
  }

  @media (prefers-reduced-motion: reduce) {
    .tab-hint, .tear-hint { animation: none; }
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: .3rem;
    height: 28px;
    padding: 0 .3rem 0 .65rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 7px;
    color: var(--chrome-fg);
    font-size: 12.5px;
    cursor: default;
    max-width: 210px;
    min-width: 92px;
    flex: 0 1 auto;
    position: relative;
    user-select: none;
    /* `touch-action: none` is what lets a pen or touch drag reorder tabs at
       all — without it the gesture is stolen by the strip's own scrolling
       before the handlers ever see a second move event. */
    touch-action: none;
    transition: background-color 90ms ease, color 90ms ease;
  }
  .tab:hover { background: var(--chrome-hover); color: var(--fg); }
  .tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
  /* Filled with PAPER, not with a generic raised chrome tone. That is the
     whole trick: the selected tab is a hole punched through the chrome to the
     document plane underneath, so "which tab am I reading?" is answered by
     material rather than by an accent stripe. VS Code encodes the same rule
     (`tab.activeBackground` == `editor.background`) even though its tab shape
     doesn't show it. */
  .tab.active {
    background: var(--bg);
    border-color: var(--chrome-border);
    color: var(--fg-strong);
    font-weight: 550;
    box-shadow: var(--shadow-sm);
  }

  /* ─── Drag ────────────────────────────────────────────────────────────
     The tab being carried gets no transition on `transform` — it must track
     the pointer exactly, and a transition would make it lag behind the cursor
     like a balloon on a string. Its neighbours get the opposite treatment:
     they only ever move a whole tab-width at a time, so animating them is what
     turns a jump-cut into the strip visibly making room. */
  .tab.held {
    z-index: 3;
    background: var(--bg);
    border-color: var(--chrome-border);
    box-shadow: var(--shadow-md);
    cursor: grabbing;
    transition: box-shadow 120ms ease;
  }
  .tab.sliding {
    transition: transform 160ms cubic-bezier(.2, .7, .3, 1),
                background-color 90ms ease, color 90ms ease;
  }
  .tab.settling {
    transition: transform 150ms cubic-bezier(.2, .7, .3, 1);
  }
  /* Armed for tear-out: the tab lifts further and dims the strip's claim on
     it, so "let go and this leaves" is legible before you commit. */
  .tab.tearing {
    opacity: .55;
    box-shadow: var(--shadow-md);
    border-color: var(--accent);
  }

  .name {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The dot and the × occupy the same 18px slot; only one is ever visible. */
  .trailing {
    position: relative;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }
  .close {
    position: absolute;
    inset: 0;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    cursor: default;
    opacity: 0;
    transition: opacity 90ms ease, background-color 90ms ease;
  }
  .tab:hover .close,
  .tab.active .close,
  .close:focus-visible { opacity: 1; }
  /* …and when the × appears, the unsaved dot gets out of its way. */
  .tab:hover .dot,
  .tab.active:hover .dot { opacity: 0; }
  .close:hover {
    background: var(--chrome-hover);
    color: var(--fg-strong);
  }
  /* A drag must not be able to end on the close button and shut the tab, and
     the × sliding under the cursor mid-drag is pure noise. */
  .tab-bar.dragging .close { opacity: 0; pointer-events: none; }

  .new-tab {
    background: transparent;
    border: 0;
    width: 26px;
    height: 26px;
    padding: 0;
    color: var(--chrome-fg);
    cursor: default;
    flex-shrink: 0;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 2px;
  }
  .new-tab:hover {
    background: var(--chrome-hover);
    color: var(--fg-strong);
  }

  @media (prefers-reduced-motion: reduce) {
    .tab, .close, .tab.sliding, .tab.settling { transition: none; }
  }
</style>
