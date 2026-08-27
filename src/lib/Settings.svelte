<script lang="ts">
  import { settings, type ThemeMode, WIDTH_MIN, WIDTH_DEFAULT, widthMax } from "./settings-store.svelte";
  import { MOD, sk } from "./platform";
  import { api } from "./api";
  import { annotations } from "./annotations/store.svelte";
  import { HIGHLIGHT_COLORS } from "./annotations/types";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import UpdatePanel from "./UpdatePanel.svelte";

  interface Props { open: boolean }
  let { open = $bindable(false) }: Props = $props();

  let markCount = $derived(Object.keys(settings.s.scrollMemory ?? {}).length);

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

    <h3 class="group-head">Appearance</h3>

    <label>
      <span>Theme</span>
      <select
        value={settings.s.theme}
        onchange={(e) => settings.set("theme", (e.currentTarget as HTMLSelectElement).value as ThemeMode)}
      >
        <option value="auto">Auto (follow system)</option>
        <option value="light">Light</option>
        <option value="sepia">Sepia (easy on the eyes)</option>
        <option value="dark">Dark</option>
      </select>
    </label>

    <fieldset class="surface-group">
      <legend><span>Window surfaces</span></legend>
      <p class="hint smart-hint">
        How much the chrome around your document separates itself by tone.
        <strong>Layered</strong> steps the title bar, toolbar and side panel
        apart, each one a shade further from the page. <strong>Flat</strong>
        keeps them all on a single colour, separated by edges alone.
        Works with every theme.
      </p>
      <div class="presets">
        <button
          type="button"
          class:active={settings.s.surfaceStyle === "layered"}
          onclick={() => settings.set("surfaceStyle", "layered")}
        >Layered</button>
        <button
          type="button"
          class:active={settings.s.surfaceStyle === "flat"}
          onclick={() => settings.set("surfaceStyle", "flat")}
        >Flat</button>
      </div>
    </fieldset>

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
        max={widthMax()}
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
      <small class="hint">Tip: <kbd>{MOD}</kbd>+<kbd>]</kbd> wider · <kbd>{MOD}</kbd>+<kbd>[</kbd> narrower · <kbd>{MOD}</kbd>+<kbd>\\</kbd> full · <kbd>Alt</kbd>+scroll over the page</small>
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
        checked={settings.s.centerHeadings}
        onchange={(e) => settings.set("centerHeadings", (e.currentTarget as HTMLInputElement).checked)}
      />
      <span>Center headings <small>(for resumes / formal docs)</small></span>
    </label>

    <h3 class="group-head">Side panel</h3>

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
        checked={settings.s.panelHoverPeek}
        onchange={(e) => settings.set("panelHoverPeek", (e.currentTarget as HTMLInputElement).checked)}
      />
      <span>Peek the side panel on left-edge hover <small>(when collapsed)</small></span>
    </label>

    <h3 class="group-head">Reading</h3>

    <fieldset class="reading-group">
      <legend>
        <span>Reading position</span>
        <span class="value">{markCount === 0 ? "nothing saved" : `${markCount} ${markCount === 1 ? "file" : "files"}`}</span>
      </legend>
      <p class="hint smart-hint">
        Every tab keeps its own scroll position while Fox MD is open. These
        options control whether that position also survives closing the app.
      </p>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.s.rememberScroll}
          onchange={(e) => settings.set("rememberScroll", (e.currentTarget as HTMLInputElement).checked)}
        />
        <span>Resume where I left off <small>(across sessions)</small></span>
      </label>
      <label class="check">
        <input
          type="checkbox"
          disabled={!settings.s.rememberScroll}
          checked={settings.s.resumeRibbon}
          onchange={(e) => settings.set("resumeRibbon", (e.currentTarget as HTMLInputElement).checked)}
        />
        <span>Bookmark the spot <small>("Last here" mark in the right margin — click to jump back, ✕ to remove; it retires itself once you have read a screen past it)</small></span>
      </label>
      <div class="presets">
        <button type="button" onclick={() => settings.clearScrollMemory()} disabled={markCount === 0}>
          Forget saved positions
        </button>
      </div>
    </fieldset>

    <h3 class="group-head">Notes</h3>

    <fieldset class="notes-group">
      <legend>
        <span>Highlights &amp; comments</span>
        <span class="value">{annotations.count === 0 ? "none here" : `${annotations.count} on this file`}</span>
      </legend>
      <p class="hint smart-hint">
        Select any text to highlight it or leave a comment. Notes are saved
        beside the document in a <code>.foxmd</code> folder, as JSON plus a
        readable markdown digest &mdash; so an assistant working on the file can
        read what you said about it. They save themselves; there is nothing to press.
      </p>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.s.showHighlights}
          onchange={(e) => settings.set("showHighlights", (e.currentTarget as HTMLInputElement).checked)}
        />
        <span>Show highlights <small>({MOD}+Shift+H &mdash; hides the colour, never the note)</small></span>
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.s.showComments}
          onchange={(e) => settings.set("showComments", (e.currentTarget as HTMLInputElement).checked)}
        />
        <span>Show the comment margin <small>({MOD}+Shift+M &mdash; reserves a column on the right when the file has comments)</small></span>
      </label>
      <label>
        <span>Your name on new comments</span>
        <input
          type="text"
          class="text-input"
          placeholder="from your Windows account"
          value={settings.s.authorName}
          oninput={(e) => settings.set("authorName", (e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <div class="presets swatch-row">
        <span class="swatch-label">Default colour</span>
        {#each HIGHLIGHT_COLORS as c (c)}
          <button
            type="button"
            class="swatch-btn {c}"
            class:active={settings.s.defaultHighlightColor === c}
            onclick={() => settings.set("defaultHighlightColor", c)}
            aria-label={c}
            title={c}
          ></button>
        {/each}
      </div>
    </fieldset>

    <h3 class="group-head">Editing</h3>

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

    <h3 class="group-head">Updates</h3>

    <UpdatePanel title="Fox MD" />

    <h3 class="group-head">Advanced</h3>

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
            Fox MD switches to a focused view: subtle "receded" surface, bottom-left status bar,
            green highlight on the block currently being edited (with a soft pulse) that fades to
            yellow once the edit settles. Press <code>{sk("Mod", "Shift", "D")}</code> to open the right-side
            diff sidebar — naive red/green diff per section, or an LLM bullet summary on demand.
          </small>
        </span>
      </label>

      {#if settings.s.advancedLiveEditTheatre}
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
      {/if}
    </details>
  </div>
{/if}

<style>
  /* Notes section */
  .text-input {
    width: 100%;
    box-sizing: border-box;
    padding: .35rem .5rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 12.5px;
  }
  .swatch-row { align-items: center; gap: .35rem; }
  .swatch-label { font-size: 12px; color: var(--muted-strong); margin-right: .2rem; }
  .swatch-btn {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, .18);
    cursor: pointer;
  }
  /* The selected colour is marked with a ring rather than a tick: a tick has to
     be drawn in a colour, and there is no one colour that reads on all five. */
  .swatch-btn.active { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--fg-strong); }
  .swatch-btn.yellow { background: #ffd84d; }
  .swatch-btn.green  { background: #7fd99a; }
  .swatch-btn.blue   { background: #86c5f5; }
  .swatch-btn.pink   { background: #f9a3bd; }
  .swatch-btn.purple { background: #c3a5f0; }

  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .35);
    z-index: 20;
  }
  /* A right-hand drawer, not a centred box.
     The centred 460px card was the wrong shape for this content: the window is
     usually maximised, so a small rectangle floating in the middle of a
     1900px screen wasted the space it was covering *and* forced a five-section
     list through a narrow column. A full-height drawer gives the list its
     length back, mirrors the left panel (same idea, opposite edge), and leaves
     the document visible beside it instead of blanking the middle of it. */
  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(560px, 96vw);
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--bg);
    color: var(--fg);
    border-left: 1px solid var(--border);
    padding: 1.1rem 1.6rem 3rem;
    z-index: 21;
    box-shadow: -12px 0 48px rgba(0, 0, 0, .18);
    animation: drawer-in 180ms cubic-bezier(.2, .8, .3, 1) both;
  }
  @keyframes drawer-in {
    from { transform: translateX(18px); opacity: 0; }
    to   { transform: translateX(0); opacity: 1; }
  }
  /* The header rides along at the top of the scroller, so the title and the
     way out are reachable from anywhere in a long settings list. */
  header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: -1.1rem -1.6rem 1rem;
    padding: .9rem 1.6rem .7rem;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  header h2 { font-size: 1.05rem; margin: 0; }
  .close {
    background: none;
    border: 0;
    color: var(--muted-strong);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: .25rem .4rem;
    border-radius: 6px;
  }
  .close:hover { background: var(--hover-bg); color: var(--fg-strong); }

  @media (prefers-reduced-motion: reduce) {
    .panel { animation: none; }
  }
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
  /* Section headings. The panel was one undifferentiated column of controls
     where a theme picker and an LLM API key carried exactly the same visual
     weight; five headings turn it into something you can scan. Small caps,
     a rule, and generous space above — the divider is the heading, so no
     extra <hr> is needed. */
  .group-head {
    margin: 1.6rem 0 .2rem;
    padding-bottom: .35rem;
    border-bottom: 1px solid var(--border);
    font-size: 10.5px;
    font-weight: 650;
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .group-head:first-of-type { margin-top: .2rem; }

  /* --- Updates ------------------------------------------------------- */
  .hint.err { color: #e5484d; }
  .hint.note { color: var(--accent); }

  fieldset.width-group,
  fieldset.surface-group,
  fieldset.smart-diff-group,
  fieldset.reading-group,
  fieldset.editor-mode-group {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: .5rem .75rem .75rem;
    margin: .9rem 0;
  }
  fieldset.editor-mode-group legend,
  fieldset.surface-group legend {
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
  fieldset.width-group legend,
  fieldset.reading-group legend {
    display: inline-flex;
    gap: .5rem;
    align-items: baseline;
    padding: 0 .35rem;
    font-size: 13px;
  }
  fieldset.reading-group .check { margin: .5rem 0; }
  fieldset.reading-group .check small { color: var(--muted); font-size: 11px; }
  fieldset.reading-group input[type="checkbox"]:disabled + span { opacity: .5; }
  .presets button[disabled] { opacity: .45; cursor: default; }
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
