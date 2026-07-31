<script lang="ts">
  import { tabs, tabName, type Tab } from "./tabs-store.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import Icon from "./Icon.svelte";
  import { contextMenu, type MenuEntry } from "./context-menu.svelte";
  import { isMac, sk, copyText, revealInFileManager } from "./platform";

  interface Props {
    onNewTab: () => void;
  }
  let { onNewTab }: Props = $props();

  let dragId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);
  /// Set by per-tab onDrop. If true, the drop was a successful in-bar reorder
  /// and we must NOT tear out on dragend.
  let dropHandledInside = false;

  function onDragStart(e: DragEvent, t: Tab) {
    if (!e.dataTransfer) return;
    dragId = t.id;
    dropHandledInside = false;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-md-reader-tab", t.path);
    e.dataTransfer.setData("text/plain", t.path);
  }

  // Per-tab dragover: enables drop-on-tab for reorder + visual highlight.
  function onTabDragOver(e: DragEvent, t: Tab) {
    if (!dragId || !e.dataTransfer) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragId !== t.id) dragOverId = t.id;
  }

  // Bar-level dragover: makes the entire tab bar a drop target so drops on
  // empty space (between tabs, on the "+" button, etc.) DON'T trigger tear-out.
  function onBarDragOver(e: DragEvent) {
    if (!dragId || !e.dataTransfer) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onBarDrop(e: DragEvent) {
    // Drop on empty bar area — no-op, but mark as handled so dragend skips tear-out.
    e.preventDefault();
    if (dragId) dropHandledInside = true;
  }

  function onDrop(e: DragEvent, t: Tab) {
    e.preventDefault();
    if (!dragId) return;
    dropHandledInside = true;
    if (dragId === t.id) return;
    const fromIdx = tabs.tabs.findIndex((x) => x.id === dragId);
    const toIdx = tabs.tabs.findIndex((x) => x.id === t.id);
    tabs.reorder(fromIdx, toIdx);
  }

  async function onDragEnd(e: DragEvent) {
    const id = dragId;
    const handled = dropHandledInside;
    dragId = null;
    dragOverId = null;
    dropHandledInside = false;
    if (!id) return;

    // Skip tear-out if the drop was inside the tab bar (handled by onDrop /
    // onBarDrop) — this covers reorders and "dropped on empty bar area."
    if (handled) return;

    // The reliable cross-platform signal for "drop landed outside any
    // accepting target" is dropEffect === "none". Browsers set this when no
    // dragover handler called preventDefault on the final position. That
    // includes drops outside the window entirely, AND drops onto in-window
    // elements that don't accept (e.g. the rendered Viewer area). Either way,
    // user intent is "send this elsewhere." (clientX/Y is unreliable in
    // WebView2 on outside-window drops — often reports 0,0.)
    if (e.dataTransfer?.dropEffect !== "none") return;

    const draggedTab = tabs.tabs.find((t) => t.id === id);
    if (!draggedTab) return;

    try {
      await invoke("spawn_window", { file: draggedTab.path });
      tabs.close(id);
    } catch (err) {
      console.error("spawn_window failed", err);
    }
  }

  function close(e: MouseEvent, id: string) {
    e.stopPropagation();
    tabs.close(id);
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

{#if tabs.tabs.length > 0}
  <div
    class="tab-bar"
    role="tablist"
    tabindex="-1"
    ondragover={onBarDragOver}
    ondrop={onBarDrop}
    oncontextmenu={(e) => contextMenu.open(e, barMenu())}
  >
    {#each tabs.tabs as t (t.id)}
      <div
        role="tab"
        tabindex="0"
        aria-selected={tabs.activeId === t.id}
        class="tab"
        class:active={tabs.activeId === t.id}
        class:dirty={t.dirty}
        class:drag-over={dragOverId === t.id}
        draggable="true"
        ondragstart={(e) => onDragStart(e, t)}
        ondragover={(e) => onTabDragOver(e, t)}
        ondrop={(e) => onDrop(e, t)}
        ondragend={onDragEnd}
        onclick={() => tabs.switchTo(t.id)}
        onauxclick={(e) => onAuxClick(e, t)}
        oncontextmenu={(e) => contextMenu.open(e, tabMenu(t))}
        onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tabs.switchTo(t.id); } }}
        title={t.path}
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
  .tab.drag-over {
    background: var(--accent-soft);
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
    .tab, .close { transition: none; }
  }
</style>
