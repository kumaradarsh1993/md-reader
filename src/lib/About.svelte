<script lang="ts">
  import { getVersion } from "@tauri-apps/api/app";
  import { onMount } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";

  interface Props { open: boolean }
  let { open = $bindable(false) }: Props = $props();

  let version = $state<string>("");
  let tauriVersion = $state<string>("");

  onMount(async () => {
    try { version = await getVersion(); } catch { version = "unknown"; }
    try {
      const { getTauriVersion } = await import("@tauri-apps/api/app");
      tauriVersion = await getTauriVersion();
    } catch { tauriVersion = ""; }
  });

  function go(url: string) {
    // Use plugin-opener so links open in the user's default browser, not inside the webview.
    openUrl(url).catch(() => { /* noop */ });
  }
</script>

{#if open}
  <div class="backdrop" onclick={() => (open = false)} role="presentation"></div>
  <div class="panel" role="dialog" aria-label="About md-reader">
    <header>
      <div class="title-row">
        <span class="glyph">📝</span>
        <div>
          <h2>md-reader</h2>
          <p class="tagline">A Markdown reader and editor for the AI era</p>
        </div>
      </div>
      <button class="close" onclick={() => (open = false)} aria-label="Close">✕</button>
    </header>

    <dl class="meta">
      <dt>Version</dt>
      <dd><code>{version || "…"}</code></dd>
      <dt>Built with</dt>
      <dd>Tauri {tauriVersion || "2"} · Rust · Svelte 5 · Milkdown</dd>
      <dt>License</dt>
      <dd>MIT</dd>
    </dl>

    <div class="links">
      <button class="link-btn" onclick={() => go("https://github.com/kumaradarsh1993/md-reader")}>
        <span class="link-icon">⛓</span>
        <span>
          <strong>Repository</strong>
          <small>github.com/kumaradarsh1993/md-reader</small>
        </span>
      </button>
      <button class="link-btn" onclick={() => go("https://github.com/kumaradarsh1993/md-reader/releases/latest")}>
        <span class="link-icon">⬇</span>
        <span>
          <strong>Latest release / Check for updates</strong>
          <small>releases page</small>
        </span>
      </button>
      <button class="link-btn" onclick={() => go("https://github.com/kumaradarsh1993/md-reader/issues/new?template=bug.md")}>
        <span class="link-icon">🐞</span>
        <span>
          <strong>Report a bug</strong>
          <small>opens GitHub Issues</small>
        </span>
      </button>
      <button class="link-btn" onclick={() => go("https://github.com/kumaradarsh1993/md-reader/issues/new?template=feature.md")}>
        <span class="link-icon">💡</span>
        <span>
          <strong>Suggest a feature</strong>
          <small>opens GitHub Issues</small>
        </span>
      </button>
    </div>

    <p class="footer">
      Local-only. No telemetry. No accounts. The file on disk is the source of truth.
    </p>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .35);
    z-index: 20;
  }
  .panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(440px, 92vw);
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.4rem 1.6rem 1.2rem;
    z-index: 21;
    box-shadow: 0 12px 48px rgba(0, 0, 0, .25);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: .85rem;
  }
  .glyph {
    font-size: 28px;
    line-height: 1;
  }
  header h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: -0.012em;
  }
  .tagline {
    margin: .15rem 0 0;
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.4;
  }
  .close {
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: .15rem .4rem;
    border-radius: 4px;
  }
  .close:hover { color: var(--fg); background: var(--hover-bg); }
  dl.meta {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: .35rem .85rem;
    margin: 0 0 1rem;
    padding: .75rem 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    font-size: 12.5px;
  }
  dl.meta dt {
    color: var(--muted);
  }
  dl.meta dd {
    margin: 0;
    color: var(--fg);
  }
  dl.meta code {
    font-family: ui-monospace, Menlo, Consolas, "Cascadia Mono", monospace;
    font-size: 12px;
    background: var(--code-inline-bg);
    padding: .12em .4em;
    border-radius: 4px;
  }
  .links {
    display: flex;
    flex-direction: column;
    gap: .3rem;
  }
  .link-btn {
    display: flex;
    align-items: center;
    gap: .75rem;
    width: 100%;
    background: transparent;
    border: 1px solid transparent;
    color: var(--fg);
    padding: .55rem .7rem;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    font: inherit;
    height: auto;
    transition: background-color 100ms;
  }
  .link-btn:hover {
    background: var(--hover-bg);
    border-color: var(--border);
  }
  .link-icon {
    font-size: 16px;
    width: 24px;
    text-align: center;
    flex-shrink: 0;
    opacity: .85;
  }
  .link-btn strong {
    display: block;
    font-size: 13px;
    font-weight: 500;
  }
  .link-btn small {
    display: block;
    font-size: 11px;
    color: var(--muted);
    margin-top: 1px;
  }
  .footer {
    margin: 1rem 0 0;
    font-size: 11px;
    color: var(--muted);
    text-align: center;
    line-height: 1.5;
  }
</style>
