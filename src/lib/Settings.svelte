<script lang="ts">
  import { settings, type MaxWidth, type ThemeMode } from "./settings-store.svelte";

  interface Props { open: boolean }
  let { open = $bindable(false) }: Props = $props();
</script>

{#if open}
  <div class="backdrop" onclick={() => (open = false)} role="presentation"></div>
  <div class="panel" role="dialog" aria-label="Settings">
    <header>
      <h2>Settings</h2>
      <button class="close" onclick={() => (open = false)}>✕</button>
    </header>

    <label>
      <span>Theme</span>
      <select
        value={settings.s.theme}
        onchange={(e) => settings.set("theme", (e.currentTarget as HTMLSelectElement).value as ThemeMode)}
      >
        <option value="auto">Auto (follow system)</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>

    <label>
      <span>Max width</span>
      <select
        value={settings.s.maxWidth}
        onchange={(e) => settings.set("maxWidth", (e.currentTarget as HTMLSelectElement).value as MaxWidth)}
      >
        <option value="narrow">Narrow (56ch)</option>
        <option value="wide">Wide (86ch)</option>
        <option value="full">Full window</option>
      </select>
    </label>

    <label>
      <span>Font size: {settings.s.fontSize}px</span>
      <input
        type="range"
        min="11"
        max="24"
        step="1"
        value={settings.s.fontSize}
        oninput={(e) => settings.set("fontSize", +(e.currentTarget as HTMLInputElement).value)}
      />
    </label>

    <label>
      <span>Zoom: {Math.round(settings.s.zoom * 100)}%</span>
      <input
        type="range"
        min="0.5"
        max="2.5"
        step="0.05"
        value={settings.s.zoom}
        oninput={(e) => settings.set("zoom", +(e.currentTarget as HTMLInputElement).value)}
      />
    </label>

    <label>
      <span>Font family</span>
      <input
        type="text"
        value={settings.s.fontFamily}
        onchange={(e) => settings.set("fontFamily", (e.currentTarget as HTMLInputElement).value)}
      />
    </label>

    <label class="check">
      <input
        type="checkbox"
        checked={settings.s.showToc}
        onchange={(e) => settings.set("showToc", (e.currentTarget as HTMLInputElement).checked)}
      />
      <span>Show outline sidebar</span>
    </label>
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
    width: min(420px, 92vw);
    max-height: 86vh;
    overflow: auto;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
    z-index: 21;
    box-shadow: 0 12px 48px rgba(0, 0, 0, .25);
  }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  header h2 { font-size: 1.1rem; margin: 0; }
  .close { background: none; border: 0; color: var(--fg); cursor: pointer; font-size: 1rem; }
  label {
    display: flex;
    flex-direction: column;
    gap: .35rem;
    margin: .9rem 0;
    font-size: 13px;
  }
  label.check { flex-direction: row; align-items: center; gap: .5rem; }
  input[type="text"], select {
    padding: .35rem .5rem;
    background: var(--input-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
  }
</style>
