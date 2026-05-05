<script lang="ts">
  import { tabs, tabName, type Tab } from "./tabs-store.svelte";
  import { invoke } from "@tauri-apps/api/core";

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
</script>

{#if tabs.tabs.length > 0}
  <div
    class="tab-bar"
    role="tablist"
    tabindex="-1"
    ondragover={onBarDragOver}
    ondrop={onBarDrop}
  >
    {#each tabs.tabs as t (t.id)}
      <div
        role="tab"
        tabindex="0"
        aria-selected={tabs.activeId === t.id}
        class="tab"
        class:active={tabs.activeId === t.id}
        class:drag-over={dragOverId === t.id}
        draggable="true"
        ondragstart={(e) => onDragStart(e, t)}
        ondragover={(e) => onTabDragOver(e, t)}
        ondrop={(e) => onDrop(e, t)}
        ondragend={onDragEnd}
        onclick={() => tabs.switchTo(t.id)}
        onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tabs.switchTo(t.id); } }}
        title={t.path}
      >
        <span class="name">{tabName(t.path)}</span>
        {#if t.dirty}<span class="dot">●</span>{/if}
        <button class="close" onclick={(e) => close(e, t.id)} aria-label="Close tab" tabindex="-1">×</button>
      </div>
    {/each}
    <button class="new-tab" onclick={onNewTab} title="New tab (Ctrl+T)" aria-label="New tab">+</button>
  </div>
{/if}

<style>
  .tab-bar {
    display: flex;
    align-items: stretch;
    gap: 1px;
    padding: 0 .5rem;
    height: 32px;
    background: var(--muted-bg);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-app-region: no-drag;
    flex-shrink: 0;
  }
  .tab-bar::-webkit-scrollbar { height: 0; }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    height: 100%;
    padding: 0 .35rem 0 .8rem;
    background: transparent;
    border: 0;
    border-radius: 0;
    color: var(--muted-strong);
    font-size: 12.5px;
    cursor: pointer;
    max-width: 220px;
    min-width: 80px;
    flex: 0 1 auto;
    position: relative;
    user-select: none;
    transition: background-color 80ms ease;
  }
  .tab + .tab {
    border-left: 1px solid var(--border);
  }
  .tab:hover { background: var(--hover-bg); }
  .tab.active {
    background: var(--bg);
    color: var(--fg-strong);
    font-weight: 500;
    box-shadow: inset 0 -1px 0 var(--bg);
  }
  .tab.active::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: var(--accent);
  }
  .tab.drag-over {
    background: var(--accent-soft);
  }
  .name {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    color: var(--accent);
    font-size: 10px;
    line-height: 1;
  }
  .close {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
    cursor: pointer;
  }
  .close:hover {
    background: rgba(127, 127, 127, .25);
    color: var(--fg);
  }
  .new-tab {
    background: transparent;
    border: 0;
    width: 28px;
    height: 100%;
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
    flex-shrink: 0;
    border-radius: 0;
  }
  .new-tab:hover {
    background: var(--hover-bg);
    color: var(--fg);
  }
</style>
