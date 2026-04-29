<script lang="ts">
  import { tabs, tabName, type Tab } from "./tabs-store.svelte";
  import { invoke } from "@tauri-apps/api/core";

  interface Props {
    onNewTab: () => void;
  }
  let { onNewTab }: Props = $props();

  let dragId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);

  function onDragStart(e: DragEvent, t: Tab) {
    if (!e.dataTransfer) return;
    dragId = t.id;
    e.dataTransfer.effectAllowed = "move";
    // Used for cross-window drop detection
    e.dataTransfer.setData("application/x-md-reader-tab", t.path);
    e.dataTransfer.setData("text/plain", t.path);
  }

  function onDragOver(e: DragEvent, t: Tab) {
    if (dragId && dragId !== t.id) {
      e.preventDefault();
      dragOverId = t.id;
    }
  }

  function onDrop(e: DragEvent, t: Tab) {
    e.preventDefault();
    if (!dragId || dragId === t.id) return;
    const fromIdx = tabs.tabs.findIndex((x) => x.id === dragId);
    const toIdx = tabs.tabs.findIndex((x) => x.id === t.id);
    tabs.reorder(fromIdx, toIdx);
    dragId = null;
    dragOverId = null;
  }

  async function onDragEnd(e: DragEvent) {
    // If the drag ended OUTSIDE the window, spawn a new window with this tab.
    // We approximate "outside" by checking if the drop position is outside the
    // viewport rectangle.
    if (!dragId) return;
    const draggedTab = tabs.tabs.find((t) => t.id === dragId);
    dragId = null;
    dragOverId = null;
    if (!draggedTab) return;

    const insideViewport =
      e.clientX >= 0 &&
      e.clientY >= 0 &&
      e.clientX <= window.innerWidth &&
      e.clientY <= window.innerHeight;

    if (!insideViewport && tabs.tabs.length > 1) {
      // Tear out into a new window
      try {
        await invoke("spawn_window", { file: draggedTab.path });
        tabs.close(draggedTab.id);
      } catch (err) {
        console.error("spawn_window failed", err);
      }
    }
  }

  function close(e: MouseEvent, id: string) {
    e.stopPropagation();
    tabs.close(id);
  }
</script>

{#if tabs.tabs.length > 0}
  <div class="tab-bar" role="tablist">
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
        ondragover={(e) => onDragOver(e, t)}
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
