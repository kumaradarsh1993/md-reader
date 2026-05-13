<script lang="ts">
  import type { Tab } from "../tabs-store.svelte";
  import { dismiss, toggleSidebar } from "./store.svelte";
  import { changedLineCount, changedSections } from "./diff-engine";

  interface Props { tab: Tab; }
  let { tab }: Props = $props();

  // Compute change count from current snapshots. Cheap (~ms) — diff-match-patch
  // line mode on typical files. Recomputed reactively as source changes.
  let liveChanges = $derived.by(() => {
    if (tab.pendingTurnBefore === null) return 0;
    if (tab.pendingTurnBefore === tab.source) return 0;
    return changedLineCount(changedSections(tab.pendingTurnBefore, tab.source));
  });

  let doneChanges = $derived.by(() => {
    if (tab.turns.length === 0) return 0;
    const t = tab.turns[0];
    return changedLineCount(changedSections(t.snapshotBefore, t.snapshotAfter));
  });
</script>

{#if tab.theatrePhase === "engaging" || tab.theatrePhase === "engaged"}
  <div class="status-bar engaged" role="status" aria-live="polite">
    <span class="dot-pulse" aria-hidden="true"></span>
    <span class="label">
      🎬 AI editing — {liveChanges || "…"} {liveChanges === 1 ? "change" : "changes"} so far
    </span>
    <span class="hint">pause to dismiss</span>
  </div>
{:else if tab.theatrePhase === "done"}
  <div class="status-bar done" role="status">
    <span class="check">✓</span>
    <span class="label">
      Edits done — {doneChanges} {doneChanges === 1 ? "change" : "changes"} highlighted
    </span>
    <button class="action" onclick={() => toggleSidebar(tab)}>
      {tab.sidebarOpen ? "Hide details" : "Show details →"}
    </button>
    <button class="action primary" onclick={() => dismiss(tab)}>
      Dismiss
    </button>
  </div>
{/if}

<style>
  .status-bar {
    position: fixed;
    left: 16px;
    bottom: 16px;
    display: inline-flex;
    align-items: center;
    gap: .65rem;
    padding: .55rem .85rem;
    border-radius: 999px;
    background: var(--bg-elevated);
    color: var(--fg);
    border: 1px solid var(--border);
    box-shadow: 0 8px 28px rgba(0, 0, 0, .18), 0 2px 6px rgba(0, 0, 0, .08);
    font-size: 12.5px;
    line-height: 1;
    z-index: 30;
    animation: status-rise .35s cubic-bezier(.2, .9, .3, 1.2) both;
    user-select: none;
  }
  @keyframes status-rise {
    from { transform: translateY(20px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }
  .dot-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 0 var(--accent);
    animation: pulse 1.4s ease-out infinite;
    flex-shrink: 0;
  }
  @keyframes pulse {
    0%   { box-shadow: 0 0 0 0 rgba(10, 132, 255, .55); }
    70%  { box-shadow: 0 0 0 10px rgba(10, 132, 255, 0); }
    100% { box-shadow: 0 0 0 0 rgba(10, 132, 255, 0); }
  }
  .check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
    color: white;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .label {
    font-weight: 500;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    color: var(--muted);
    font-size: 11.5px;
  }
  .action {
    background: transparent;
    border: 0;
    color: var(--fg);
    font-size: 12px;
    padding: .25rem .6rem;
    border-radius: 999px;
    cursor: pointer;
    margin-left: .15rem;
    height: auto;
  }
  .action:hover { background: var(--hover-bg); }
  .action.primary {
    background: var(--accent);
    color: white;
  }
  .action.primary:hover { filter: brightness(1.08); }
</style>
