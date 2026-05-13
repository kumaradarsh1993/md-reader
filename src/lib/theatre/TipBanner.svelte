<script lang="ts">
  /**
   * One-shot discoverability banner for users who haven't enabled Live Edit
   * Theatre. Appears on the first external edit per tab; dismissable. The
   * point is to let people discover the feature exists without us spamming
   * them on every AI session.
   */
  import { settings } from "../settings-store.svelte";
  import type { Tab } from "../tabs-store.svelte";
  import { dismissTip } from "./store.svelte";

  interface Props { tab: Tab; externalEditObserved: boolean }
  let { tab, externalEditObserved }: Props = $props();

  // Visibility rules — all of:
  //   1. Theatre is NOT enabled (otherwise the Theatre itself is showing).
  //   2. An external edit has been observed this session for this tab.
  //   3. User hasn't dismissed the tip for this tab.
  let visible = $derived(
    !settings.s.advancedLiveEditTheatre &&
    externalEditObserved &&
    !tab.tipDismissed,
  );

  async function enable() {
    await settings.set("advancedLiveEditTheatre", true);
    dismissTip(tab); // hide the banner immediately
  }
</script>

{#if visible}
  <div class="tip" role="status">
    <span class="emoji" aria-hidden="true">💡</span>
    <span class="body">
      <strong>Did you know?</strong>
      md-reader can switch to a cinematic Live Edit view when an AI is writing to this file.
    </span>
    <button class="enable" onclick={enable}>Enable</button>
    <button class="dismiss" onclick={() => dismissTip(tab)} aria-label="Dismiss tip">✕</button>
  </div>
{/if}

<style>
  .tip {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: .65rem;
    padding: .55rem .75rem .55rem .85rem;
    background: var(--bg-elevated);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, .18);
    font-size: 12.5px;
    z-index: 30;
    animation: tip-rise .4s cubic-bezier(.2, .9, .3, 1.2) both;
    max-width: min(580px, 92vw);
  }
  @keyframes tip-rise {
    from { transform: translate(-50%, 20px); opacity: 0; }
    to   { transform: translate(-50%, 0); opacity: 1; }
  }
  .emoji { font-size: 16px; line-height: 1; }
  .body { line-height: 1.4; }
  .body strong { font-weight: 600; margin-right: .25em; }
  .enable {
    background: var(--accent);
    color: white;
    border: 0;
    padding: .25rem .65rem;
    border-radius: 999px;
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    height: auto;
  }
  .enable:hover { filter: brightness(1.08); }
  .dismiss {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: .25rem .4rem;
    border-radius: 999px;
    height: auto;
  }
  .dismiss:hover { color: var(--fg); background: var(--hover-bg); }
</style>
