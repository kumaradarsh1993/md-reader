<script lang="ts">
  import { settings, type ThemeMode, WIDTH_MIN, WIDTH_DEFAULT, widthMax } from "./settings-store.svelte";
  import { MOD, sk } from "./platform";
  import { api, type UpdateStatus, type ReleaseInfo } from "./api";
  import { openUrl } from "@tauri-apps/plugin-opener";

  interface Props { open: boolean }
  let { open = $bindable(false) }: Props = $props();

  // -- Updates ---------------------------------------------------------
  let updates = $state<UpdateStatus | null>(null);
  let checking = $state(false);
  let installing = $state<string | null>(null);
  let installNote = $state<string | null>(null);

  async function checkUpdates() {
    checking = true;
    installNote = null;
    try {
      updates = await api.checkUpdates();
    } catch (e) {
      updates = {
        current: "?",
        stable: null,
        nightly: null,
        error: String(e),
        releases_url: "https://github.com/kumaradarsh1993/md-reader/releases",
      };
    } finally {
      checking = false;
    }
  }

  // Checked when the panel opens, not at app start: an update check is a
  // network call, and the only place its answer is visible is right here.
  $effect(() => {
    if (open && !updates && !checking) void checkUpdates();
  });

  async function install(r: ReleaseInfo) {
    if (!r.asset_url || !r.asset_name) return;
    installing = r.tag;
    installNote = null;
    try {
      installNote = await api.installUpdate(r.asset_url, r.asset_name);
    } catch (e) {
      installNote = String(e);
    } finally {
      installing = null;
    }
  }

  /** "3 days ago" / "12 minutes ago" — the question is always how fresh a
   *  build is, never what o'clock it was published. */
  function age(iso: string | null): string {
    if (!iso) return "date unknown";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "date unknown";
    const mins = Math.round((Date.now() - t) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
    return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function mb(bytes: number | null): string {
    return bytes ? `${(bytes / 1048576).toFixed(1)} MB` : "";
  }

  /** Base-version compare, ignoring any pre-release suffix.
   *  A nightly and a stable of the same line report the same
   *  `CARGO_PKG_VERSION`, so this can say "newer" or "same version number" but
   *  deliberately never claims "you already have this exact build". */
  function relation(tag: string, current: string): "newer" | "same" | "older" {
    const parse = (v: string) =>
      v.replace(/^v/, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
    const a = parse(tag);
    const b = parse(current);
    for (let i = 0; i < 3; i++) {
      if ((a[i] ?? 0) > (b[i] ?? 0)) return "newer";
      if ((a[i] ?? 0) < (b[i] ?? 0)) return "older";
    }
    return "same";
  }

  let rows = $derived([
    { key: "stable", label: "Latest stable", r: updates?.stable ?? null },
    { key: "nightly", label: "Latest nightly", r: updates?.nightly ?? null },
  ]);

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
      <small class="hint">Tip: <kbd>{MOD}</kbd>+<kbd>]</kbd> wider · <kbd>{MOD}</kbd>+<kbd>[</kbd> narrower · <kbd>{MOD}</kbd>+<kbd>\\</kbd> full</small>
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

    <fieldset class="updates-group">
      <legend>
        <span>This build</span>
        <span class="value">{updates ? updates.current : "\u2026"}</span>
      </legend>

      {#if checking && !updates}
        <p class="hint smart-hint">Checking GitHub\u2026</p>
      {:else if updates?.error}
        <p class="hint smart-hint err">Couldn't check for updates \u2014 {updates.error}</p>
      {/if}

      {#each rows as row (row.key)}
        <div class="rel">
          <div class="rel-head">
            <span class="rel-label">{row.label}</span>
            {#if row.r}
              <span class="rel-tag">{row.r.tag}</span>
              {#if relation(row.r.tag, updates?.current ?? "0.0.0") === "newer"}
                <span class="chip new">newer</span>
              {:else if relation(row.r.tag, updates?.current ?? "0.0.0") === "same"}
                <span class="chip">same version</span>
              {/if}
            {:else if !checking}
              <span class="rel-none">none published</span>
            {/if}
          </div>
          {#if row.r}
            <div class="rel-meta">
              built {age(row.r.published_at)}
              {#if row.r.asset_size}<span class="dot">\u00b7</span>{mb(row.r.asset_size)}{/if}
            </div>
            {#if row.r.asset_name}
              <div class="rel-meta rel-file">{row.r.asset_name}</div>
            {/if}
            <div class="rel-actions">
              <button
                type="button"
                class="primary"
                disabled={!row.r.asset_url || installing !== null}
                onclick={() => install(row.r!)}
              >{installing === row.r.tag ? "Downloading\u2026" : "Install"}</button>
              <button type="button" onclick={() => openUrl(row.r!.html_url)}>Release notes</button>
            </div>
            {#if !row.r.asset_url}
              <p class="hint smart-hint">No installer for this platform in that release.</p>
            {/if}
          {/if}
        </div>
      {/each}

      {#if installNote}
        <p class="hint smart-hint note">{installNote}</p>
      {/if}

      <div class="presets">
        <button type="button" onclick={checkUpdates} disabled={checking}>
          {checking ? "Checking\u2026" : "Check again"}
        </button>
        <button
          type="button"
          onclick={() => openUrl(updates?.releases_url ?? "https://github.com/kumaradarsh1993/md-reader/releases")}
        >All releases</button>
      </div>
      <small class="hint">
        Install downloads the build and runs it silently, then reopens Fox MD.
        Settings, tabs and reading positions carry over.
      </small>
    </fieldset>

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
  .rel { padding: .55rem 0; border-top: 1px solid var(--border); }
  .rel:first-of-type { border-top: 0; }
  .rel-head {
    display: flex;
    align-items: center;
    gap: .4rem;
    flex-wrap: wrap;
    font-size: 12.5px;
    line-height: 1.5;
  }
  .rel-label { font-weight: 600; color: var(--fg-strong); }
  .rel-tag { font-variant-numeric: tabular-nums; color: var(--muted-strong); }
  .rel-none { color: var(--muted); font-style: italic; }
  .chip {
    font-size: 9.5px;
    font-weight: 650;
    letter-spacing: .04em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 999px;
    background: var(--muted-bg);
    color: var(--muted-strong);
    line-height: 1.6;
  }
  .chip.new { background: var(--accent-soft); color: var(--accent); }
  .rel-meta { font-size: 11.5px; color: var(--muted); line-height: 1.6; margin-top: .1rem; }
  .rel-meta .dot { margin: 0 .3rem; opacity: .5; }
  .rel-file { font-variant-numeric: tabular-nums; word-break: break-all; }
  .rel-actions { display: flex; gap: .4rem; margin-top: .45rem; }
  .rel-actions button {
    display: inline-flex;
    align-items: center;
    gap: .3rem;
    padding: .25rem .6rem;
    font-size: 12px;
    line-height: 1.5;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-elevated);
    color: var(--fg);
    cursor: pointer;
  }
  .rel-actions button:hover:not([disabled]) { background: var(--hover-bg); }
  .rel-actions button.primary { border-color: var(--accent); color: var(--accent); font-weight: 600; }
  .rel-actions button[disabled] { opacity: .45; cursor: default; }
  .hint.err { color: #e5484d; }
  .hint.note { color: var(--accent); }

  fieldset.width-group,
  fieldset.updates-group,
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
  fieldset.updates-group legend,
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
