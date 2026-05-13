<script lang="ts">
  /**
   * The small floating chip that appears after the user dismisses the
   * theatre. Lets them toggle yellow highlights without losing them, or
   * clear them entirely. Sits top-right of the viewport so it's discoverable
   * without overlapping content.
   */
  import type { Tab } from "../tabs-store.svelte";
  import { toggleHighlights, clearHighlights, toggleSidebar } from "./store.svelte";

  interface Props { tab: Tab; }
  let { tab }: Props = $props();

  // Show the chip only when we have completed turns to manage AND theatre is
  // not actively engaged. Phase "done" still shows the status bar instead.
  let visible = $derived(
    tab.theatrePhase === "off" &&
    tab.turns.length > 0 &&
    !(tab.turns.length === 0 || tab.highlightsHidden && tab.sidebarOpen === false && tab.turns.length === 0),
  );
</script>

{#if visible}
  <div class="resume-chip" role="region" aria-label="Edit highlights controls">
    <button
      class="toggle"
      class:active={!tab.highlightsHidden}
      onclick={() => toggleHighlights(tab)}
      title={tab.highlightsHidden ? "Show change highlights" : "Hide change highlights"}
    >
      <span class="dot" aria-hidden="true"></span>
      {tab.highlightsHidden ? "Show changes" : "Hide changes"}
    </button>
    <span class="sep" aria-hidden="true">·</span>
    <button class="link" onclick={() => toggleSidebar(tab)}>
      {tab.sidebarOpen ? "Hide details" : "Details"}
    </button>
    <span class="sep" aria-hidden="true">·</span>
    <button class="x" onclick={() => clearHighlights(tab)} title="Clear all change highlights" aria-label="Clear highlights">
      ✕
    </button>
  </div>
{/if}

<style>
  .resume-chip {
    position: fixed;
    top: 60px;
    right: 16px;
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    padding: .3rem .55rem .3rem .35rem;
    border-radius: 999px;
    background: var(--bg-elevated);
    color: var(--fg);
    border: 1px solid var(--border);
    box-shadow: 0 6px 20px rgba(0, 0, 0, .15);
    font-size: 12px;
    z-index: 25;
    animation: chip-slide .3s ease both;
    user-select: none;
  }
  @keyframes chip-slide {
    from { transform: translateX(20px); opacity: 0; }
    to   { transform: translateX(0); opacity: 1; }
  }
  .toggle, .link, .x {
    background: transparent;
    border: 0;
    color: var(--fg);
    font: inherit;
    cursor: pointer;
    padding: .25rem .55rem;
    border-radius: 999px;
    height: auto;
    display: inline-flex;
    align-items: center;
    gap: .35rem;
  }
  .toggle:hover, .link:hover, .x:hover { background: var(--hover-bg); }
  .toggle .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-strong);
    transition: background-color 150ms;
  }
  .toggle.active .dot { background: #f5b800; box-shadow: 0 0 0 2px rgba(245, 184, 0, .25); }
  .sep { color: var(--muted); }
  .x { padding: .25rem .45rem; color: var(--muted); }
  .x:hover { color: var(--fg); }
</style>
