<script lang="ts">
  import { settings, type ThemeMode, WIDTH_MIN, WIDTH_MAX, WIDTH_DEFAULT } from "./settings-store.svelte";

  interface Props { open: boolean }
  let { open = $bindable(false) }: Props = $props();

  const widthPresets = [
    { label: "Narrow", value: 56 },
    { label: "Default", value: WIDTH_DEFAULT },
    { label: "Wide", value: 110 },
    { label: "Extra-wide", value: 140 },
  ];
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

    <fieldset class="width-group">
      <legend>
        <span>Content width</span>
        <span class="value">
          {settings.s.fullWidth ? "Full window" : `${settings.s.contentWidthCh} ch`}
        </span>
      </legend>

      <input
        type="range"
        min={WIDTH_MIN}
        max={WIDTH_MAX}
        step="1"
        disabled={settings.s.fullWidth}
        value={settings.s.contentWidthCh}
        oninput={(e) => settings.set("contentWidthCh", +(e.currentTarget as HTMLInputElement).value)}
      />

      <div class="presets">
        {#each widthPresets as p}
          <button
            type="button"
            class:active={!settings.s.fullWidth && settings.s.contentWidthCh === p.value}
            onclick={() => { settings.set("fullWidth", false); settings.set("contentWidthCh", p.value); }}
          >{p.label}</button>
        {/each}
        <button
          type="button"
          class:active={settings.s.fullWidth}
          onclick={() => settings.set("fullWidth", !settings.s.fullWidth)}
        >Full</button>
      </div>
      <small class="hint">Tip: <kbd>Ctrl</kbd>+<kbd>]</kbd> wider · <kbd>Ctrl</kbd>+<kbd>[</kbd> narrower · <kbd>Ctrl</kbd>+<kbd>\\</kbd> full</small>
    </fieldset>

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

    <label class="check">
      <input
        type="checkbox"
        checked={settings.s.centerHeadings}
        onchange={(e) => settings.set("centerHeadings", (e.currentTarget as HTMLInputElement).checked)}
      />
      <span>Center headings <small>(for resumes / formal docs)</small></span>
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
    width: min(460px, 92vw);
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
  fieldset.width-group {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: .5rem .75rem .75rem;
    margin: .9rem 0;
  }
  fieldset.width-group legend {
    display: inline-flex;
    gap: .5rem;
    align-items: baseline;
    padding: 0 .35rem;
    font-size: 13px;
  }
  .value { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
  .presets {
    display: flex;
    gap: .35rem;
    margin-top: .5rem;
    flex-wrap: wrap;
  }
  .presets button {
    background: var(--input-bg);
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 4px;
    padding: .2rem .55rem;
    font-size: 12px;
    cursor: pointer;
  }
  .presets button:hover { background: var(--hover-bg); }
  .presets button.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .hint { display: block; margin-top: .55rem; color: var(--muted); font-size: 11px; }
  kbd {
    background: var(--muted-bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 .3em;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: .9em;
  }
</style>
