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

    <fieldset class="editor-mode-group">
      <legend><span>Default edit mode</span></legend>
      <p class="hint smart-hint">
        <strong>Smart</strong> hides markdown symbols (<code>**</code>, <code>##</code>, …) and
        edits like a Word doc. <strong>Raw</strong> shows the underlying markdown source.
        You can also switch per-tab from the toolbar.
      </p>
      <div class="presets">
        <button
          type="button"
          class:active={settings.s.editorMode === "smart"}
          onclick={() => settings.set("editorMode", "smart")}
        >Smart (WYSIWYG)</button>
        <button
          type="button"
          class:active={settings.s.editorMode === "raw"}
          onclick={() => settings.set("editorMode", "raw")}
        >Raw (markdown)</button>
      </div>
    </fieldset>

    <fieldset class="smart-diff-group">
      <legend>
        <span>Smart-diff</span>
        <span class="value">{
          settings.s.llmProvider === "groq"
            ? (settings.s.groqApiKey ? "Groq · key set" : "Groq · disabled")
            : (settings.s.anthropicApiKey ? "Anthropic · key set" : "Anthropic · disabled")
        }</span>
      </legend>
      <p class="hint smart-hint">
        Generates a 2–4 bullet summary of what changed in each section of the
        diff sidebar. Sends file content to the selected provider — leave the
        key blank to disable.
      </p>
      <div class="seg-toggle">
        <button
          type="button"
          class:active={settings.s.llmProvider === "groq"}
          onclick={() => settings.set("llmProvider", "groq")}
          title="Free tier at console.groq.com"
        >Groq (free)</button>
        <button
          type="button"
          class:active={settings.s.llmProvider === "anthropic"}
          onclick={() => settings.set("llmProvider", "anthropic")}
        >Anthropic</button>
      </div>

      {#if settings.s.llmProvider === "groq"}
        <label>
          <span>Groq API key</span>
          <input
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="gsk_..."
            value={settings.s.groqApiKey}
            onchange={(e) => settings.set("groqApiKey", (e.currentTarget as HTMLInputElement).value.trim())}
          />
        </label>
        <label>
          <span>Model</span>
          <select
            value={settings.s.groqModel}
            onchange={(e) => settings.set("groqModel", (e.currentTarget as HTMLSelectElement).value)}
          >
            <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (default, best quality)</option>
            <option value="meta-llama/llama-4-maverick-17b-128e-instruct">llama-4-maverick (newer Meta)</option>
            <option value="meta-llama/llama-4-scout-17b-16e-instruct">llama-4-scout (newer Meta, lighter)</option>
            <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (fastest)</option>
          </select>
        </label>
      {:else}
        <label>
          <span>Anthropic API key</span>
          <input
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="sk-ant-..."
            value={settings.s.anthropicApiKey}
            onchange={(e) => settings.set("anthropicApiKey", (e.currentTarget as HTMLInputElement).value.trim())}
          />
        </label>
        <label>
          <span>Model</span>
          <input
            type="text"
            spellcheck="false"
            value={settings.s.anthropicModel}
            onchange={(e) => settings.set("anthropicModel", (e.currentTarget as HTMLInputElement).value.trim() || "claude-haiku-4-5")}
          />
        </label>
      {/if}
    </fieldset>

    <details class="experimental">
      <summary>Advanced features</summary>
      <p class="hint smart-hint">
        Power-user features that stay out of the way until you turn them on.
      </p>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.s.advancedLiveEditTheatre}
          onchange={(e) => settings.set("advancedLiveEditTheatre", (e.currentTarget as HTMLInputElement).checked)}
        />
        <span>
          🎬 Live Edit Theatre
          <small>
            When an AI (Claude, ChatGPT, Cursor, …) is writing to the file you have open,
            md-reader switches to a focused view: subtle "receded" surface, bottom-left status bar,
            green highlight on the block currently being edited (with a soft pulse) that fades to
            yellow once the edit settles. Press <code>Ctrl+Shift+D</code> to open the right-side
            diff sidebar — naive red/green diff per section, or an LLM bullet summary on demand.
          </small>
        </span>
      </label>
    </details>
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
  fieldset.width-group,
  fieldset.smart-diff-group,
  fieldset.editor-mode-group {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: .5rem .75rem .75rem;
    margin: .9rem 0;
  }
  fieldset.editor-mode-group legend {
    padding: 0 .35rem;
    font-size: 13px;
  }
  details.experimental {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: .5rem .75rem;
    margin: .9rem 0;
  }
  details.experimental summary {
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    padding: .15rem 0;
    user-select: none;
  }
  details.experimental[open] summary { margin-bottom: .35rem; }
  details.experimental .check { align-items: flex-start; gap: .55rem; }
  details.experimental .check small {
    display: block;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.45;
    margin-top: .15rem;
  }
  .smart-hint {
    font-size: 11.5px;
    line-height: 1.45;
    margin: .35rem .25rem .65rem;
    color: var(--muted);
  }
  fieldset.smart-diff-group label { margin: .65rem 0; }
  fieldset.smart-diff-group input[type="password"] {
    padding: .35rem .5rem;
    background: var(--input-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 12px;
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
  .seg-toggle {
    display: inline-flex;
    background: var(--muted-bg);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
    margin: .25rem 0 .15rem;
  }
  .seg-toggle button {
    border: 0;
    background: transparent;
    color: var(--muted-strong);
    padding: .2rem .65rem;
    font-size: 12px;
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
    font-weight: 500;
  }
  .seg-toggle button:hover { color: var(--fg); }
  .seg-toggle button.active {
    background: var(--bg);
    color: var(--fg-strong);
    box-shadow: var(--shadow-sm);
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
