<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import type { UnlistenFn } from "@tauri-apps/api/event";
  import { api } from "$lib/api";
  import { settings, effectiveDark } from "$lib/settings-store.svelte";
  import Viewer from "$lib/Viewer.svelte";
  import Editor from "$lib/Editor.svelte";
  import Toc from "$lib/Toc.svelte";
  import Find from "$lib/Find.svelte";
  import Settings from "$lib/Settings.svelte";

  type Mode = "view" | "edit" | "split";

  let path = $state<string | null>(null);
  let source = $state("");
  let mode = $state<Mode>("view");
  let dirty = $state(false);
  let findOpen = $state(false);
  let settingsOpen = $state(false);
  let viewerEl: HTMLElement | null = $state(null);
  let unlistenChange: UnlistenFn | null = null;
  let unlistenCli: UnlistenFn | null = null;
  let unlistenDrop: UnlistenFn | null = null;

  $effect(() => {
    const dark = effectiveDark(settings.s.theme);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  });

  async function load(p: string) {
    try {
      const file = await api.openFile(p);
      path = file.path;
      source = file.content;
      dirty = false;
      await api.unwatchFile();
      await api.watchFile(file.path);
      await settings.pushRecent(file.path);
      const name = file.path.split(/[\\/]/).pop() ?? "md-reader";
      document.title = `${name} — md-reader`;
    } catch (e) {
      console.error(e);
      alert(`Failed to open file: ${e}`);
    }
  }

  async function pickAndLoad() {
    const p = await api.pickFile();
    if (p) await load(p);
  }

  async function save() {
    if (!path) return;
    await api.saveFile(path, source);
    dirty = false;
  }

  function setMode(m: Mode) { mode = m; }
  function toggleEdit() { mode = mode === "view" ? "split" : "view"; }

  function bumpZoom(delta: number) {
    const z = Math.min(2.5, Math.max(0.5, +(settings.s.zoom + delta).toFixed(2)));
    settings.set("zoom", z);
  }

  function bumpWidth(delta: number) {
    if (settings.s.fullWidth) settings.set("fullWidth", false);
    const w = Math.min(160, Math.max(40, settings.s.contentWidthCh + delta));
    settings.set("contentWidthCh", w);
  }

  function onKey(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); pickAndLoad(); }
    else if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); toggleEdit(); }
    else if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); findOpen = true; }
    else if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); bumpZoom(0.1); }
    else if (mod && e.key === "-") { e.preventDefault(); bumpZoom(-0.1); }
    else if (mod && e.key === "0") { e.preventDefault(); settings.set("zoom", 1.0); }
    else if (mod && e.key === "]") { e.preventDefault(); bumpWidth(8); }
    else if (mod && e.key === "[") { e.preventDefault(); bumpWidth(-8); }
    else if (mod && e.key === "\\") { e.preventDefault(); settings.set("fullWidth", !settings.s.fullWidth); }
    else if (mod && e.key.toLowerCase() === "s") {
      if (mode !== "view") { e.preventDefault(); save(); }
    } else if (e.key === "F12") {
      // open Tauri devtools (only available in dev builds)
      e.preventDefault();
      import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => {
        try { (getCurrentWebview() as any).openDevtools?.(); } catch { /* noop */ }
      });
    } else if (e.key === "Escape") {
      findOpen = false;
      settingsOpen = false;
    }
  }

  onMount(async () => {
    await settings.init();

    unlistenCli = await api.onOpenFromCli((paths) => {
      if (paths[0]) load(paths[0]);
    });

    unlistenChange = await api.onFileChanged(async (changedPath) => {
      if (path && changedPath === path) {
        try {
          const refreshed = await api.openFile(path);
          // Only update if content actually changed (avoid clobbering edits in split mode).
          if (refreshed.content !== source) {
            source = refreshed.content;
          }
        } catch { /* ignore transient read errors during atomic-save */ }
      }
    });

    // Native file-drop into the window.
    unlistenDrop = await getCurrentWebview().onDragDropEvent((evt) => {
      if (evt.payload.type === "drop" && evt.payload.paths.length > 0) {
        const p = evt.payload.paths[0];
        if (/\.(md|markdown|mdown|mkd|mkdn)$/i.test(p)) load(p);
      }
    });

    window.addEventListener("keydown", onKey);
  });

  onDestroy(() => {
    unlistenCli?.();
    unlistenChange?.();
    unlistenDrop?.();
    window.removeEventListener("keydown", onKey);
  });
</script>

<svelte:head>
  <title>md-reader</title>
</svelte:head>

<div class="shell">
  <header class="toolbar">
    <div class="left">
      <button onclick={pickAndLoad} title="Open (Ctrl+O)">Open…</button>
      <div class="seg">
        <button class:active={mode === "view"} onclick={() => setMode("view")}>View</button>
        <button class:active={mode === "split"} onclick={() => setMode("split")}>Split</button>
        <button class:active={mode === "edit"} onclick={() => setMode("edit")}>Edit</button>
      </div>
    </div>
    <div class="middle">
      {#if path}
        <span class="path" title={path}>{path}</span>
        {#if dirty}<span class="dot" title="Unsaved">●</span>{/if}
      {:else}
        <span class="muted">No file open — Ctrl+O to open, or drop a .md file here.</span>
      {/if}
    </div>
    <div class="right">
      <div class="seg" title="Content width — Ctrl+[ / Ctrl+] / Ctrl+\\">
        <button onclick={() => bumpWidth(-8)} aria-label="Narrower">‹</button>
        <span class="width-badge">{settings.s.fullWidth ? "Full" : `${settings.s.contentWidthCh}ch`}</span>
        <button onclick={() => bumpWidth(8)} aria-label="Wider">›</button>
        <button class:active={settings.s.fullWidth} onclick={() => settings.set("fullWidth", !settings.s.fullWidth)} title="Toggle full window width">⤢</button>
      </div>
      <button onclick={() => bumpZoom(-0.1)} title="Zoom out (Ctrl -)">−</button>
      <span class="zoom">{Math.round(settings.s.zoom * 100)}%</span>
      <button onclick={() => bumpZoom(0.1)} title="Zoom in (Ctrl +)">+</button>
      <button onclick={() => (findOpen = true)} title="Find (Ctrl+F)">⌕</button>
      <button onclick={() => (settingsOpen = true)} title="Settings">⚙</button>
    </div>
  </header>

  <div class="body">
    {#if settings.s.showToc && mode !== "edit"}
      <Toc {source} />
    {/if}
    <main class="content" bind:this={viewerEl}>
      {#if mode === "edit"}
        <Editor bind:source onSave={save} />
      {:else if mode === "split"}
        <div class="split">
          <Editor bind:source onSave={save} />
          <Viewer {source} basePath={path ?? ""} />
        </div>
      {:else}
        <Viewer {source} basePath={path ?? ""} />
      {/if}
      <Find bind:open={findOpen} target={viewerEl} />
    </main>
  </div>
</div>

<Settings bind:open={settingsOpen} />

<style>
  /* Apple-leaning palette — quiet neutrals, system blue accent, hairline borders */
  :global(:root) {
    --bg: #ffffff;
    --bg-elevated: #ffffff;
    --fg: #18181b;
    --fg-strong: #09090b;
    --muted: #71717a;
    --muted-strong: #52525b;
    --muted-bg: #f5f5f7;
    --border: #e4e4e7;
    --border-strong: #d4d4d8;
    --accent: #007aff;
    --accent-soft: rgba(0, 122, 255, 0.12);
    --link: #0066cc;
    --code-bg: #f7f7f8;
    --code-inline-bg: rgba(120, 120, 128, 0.16);
    --blockquote-bg: transparent;
    --side-bg: #fafafa;
    --toolbar-bg: rgba(255, 255, 255, 0.78);
    --toolbar-border: rgba(0, 0, 0, 0.07);
    --hover-bg: rgba(0, 0, 0, 0.045);
    --input-bg: #ffffff;
    --zebra-bg: #fafafa;
    --highlight-bg: rgba(255, 214, 0, 0.45);
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
    --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.08);
    --radius-sm: 5px;
    --radius-md: 8px;
    --radius-lg: 12px;
  }
  :global(html[data-theme="dark"]) {
    --bg: #1c1c1e;
    --bg-elevated: #2c2c2e;
    --fg: #f5f5f7;
    --fg-strong: #ffffff;
    --muted: #98989f;
    --muted-strong: #c7c7cc;
    --muted-bg: #2c2c2e;
    --border: #38383a;
    --border-strong: #48484a;
    --accent: #0a84ff;
    --accent-soft: rgba(10, 132, 255, 0.18);
    --link: #64b5f6;
    --code-bg: #2c2c2e;
    --code-inline-bg: rgba(120, 120, 128, 0.32);
    --blockquote-bg: transparent;
    --side-bg: #1c1c1e;
    --toolbar-bg: rgba(28, 28, 30, 0.78);
    --toolbar-border: rgba(255, 255, 255, 0.08);
    --hover-bg: rgba(255, 255, 255, 0.06);
    --input-bg: #2c2c2e;
    --zebra-bg: #232325;
    --highlight-bg: rgba(255, 204, 0, 0.32);
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.45);
  }

  :global(html), :global(body) {
    margin: 0;
    height: 100%;
    background: var(--bg);
    color: var(--fg);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", "Inter", system-ui, sans-serif;
    font-feature-settings: "kern", "liga", "calt", "ss01";
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  :global(*) { box-sizing: border-box; }
  :global(*::selection) { background: var(--accent-soft); }

  /* Thin macOS-style scrollbars */
  :global(::-webkit-scrollbar) { width: 12px; height: 12px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) {
    background: transparent;
    border: 3px solid transparent;
    border-radius: 8px;
    background-clip: padding-box;
  }
  :global(*:hover::-webkit-scrollbar-thumb) { background-color: rgba(120, 120, 128, 0.4); background-clip: padding-box; }
  :global(::-webkit-scrollbar-thumb:hover) { background-color: rgba(120, 120, 128, 0.6) !important; background-clip: padding-box; }

  :global(button:focus-visible),
  :global(input:focus-visible),
  :global(select:focus-visible),
  :global(a:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  :global(mark.find-hit) { background: #ffe066; color: #111; padding: 0 1px; border-radius: 2px; }
  :global(mark.find-hit.active) { background: #ff9f0a; color: #111; }

  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  /* Toolbar — taller, calmer, glassy */
  .toolbar {
    display: flex;
    align-items: center;
    gap: .85rem;
    padding: .5rem .85rem;
    height: 44px;
    background: var(--toolbar-bg);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-bottom: 1px solid var(--toolbar-border);
    user-select: none;
    -webkit-app-region: drag;
    flex-shrink: 0;
  }
  .toolbar button,
  .toolbar .seg,
  .toolbar .width-badge { -webkit-app-region: no-drag; }

  .left, .right {
    display: flex;
    align-items: center;
    gap: .25rem;
  }
  .right { gap: .15rem; }
  .middle {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: .4rem;
    min-width: 0;
    padding: 0 .5rem;
  }
  .path {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
  .muted { color: var(--muted); font-size: 12px; }
  .dot { color: var(--accent); font-size: 10px; line-height: 1; }
  .zoom { font-size: 11px; color: var(--muted); min-width: 2.8em; text-align: center; font-variant-numeric: tabular-nums; }
  .width-badge {
    display: inline-flex;
    align-items: center;
    padding: 0 .55rem;
    height: 24px;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    min-width: 4.2em;
    justify-content: center;
  }

  /* All toolbar buttons share a common shape */
  button {
    background: transparent;
    border: 1px solid transparent;
    color: var(--fg);
    padding: 0 .55rem;
    height: 28px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    line-height: 1;
    transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  button:hover { background: var(--hover-bg); }
  button:active { background: var(--accent-soft); }

  /* Pill segmented control */
  .seg {
    display: inline-flex;
    align-items: center;
    background: var(--muted-bg);
    border-radius: 7px;
    padding: 2px;
    gap: 2px;
  }
  .seg button {
    border: 0;
    height: 22px;
    padding: 0 .65rem;
    font-size: 12px;
    color: var(--muted-strong);
    border-radius: 5px;
  }
  .seg button:hover { background: rgba(255,255,255,0.5); color: var(--fg); }
  :global(html[data-theme="dark"]) .seg button:hover { background: rgba(255,255,255,0.06); }
  .seg button.active {
    background: var(--bg);
    color: var(--fg-strong);
    box-shadow: var(--shadow-sm);
    font-weight: 500;
  }
  :global(html[data-theme="dark"]) .seg button.active { background: var(--border-strong); }

  .body {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
  }
  .content {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .split {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
  }
  .split :global(.editor-host),
  .split :global(.viewer) {
    flex: 1 1 0;
    width: 50%;
    border-right: 1px solid var(--border);
  }
  .split :global(.viewer) { border-right: 0; }
</style>
