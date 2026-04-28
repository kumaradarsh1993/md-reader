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

  function onKey(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); pickAndLoad(); }
    else if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); toggleEdit(); }
    else if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); findOpen = true; }
    else if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); bumpZoom(0.1); }
    else if (mod && e.key === "-") { e.preventDefault(); bumpZoom(-0.1); }
    else if (mod && e.key === "0") { e.preventDefault(); settings.set("zoom", 1.0); }
    else if (mod && e.key.toLowerCase() === "s") {
      if (mode !== "view") { e.preventDefault(); save(); }
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
  :global(:root) {
    --bg: #ffffff;
    --fg: #1a1a1a;
    --muted: #6b6b6b;
    --muted-bg: #f3f4f6;
    --border: #e5e7eb;
    --accent: #3b82f6;
    --link: #2563eb;
    --code-bg: #f6f8fa;
    --blockquote-bg: #f8fafc;
    --side-bg: #fafafa;
    --toolbar-bg: #ffffff;
    --hover-bg: #eef2ff;
    --input-bg: #ffffff;
  }
  :global(html[data-theme="dark"]) {
    --bg: #1a1b1e;
    --fg: #e7e7ea;
    --muted: #9aa0a6;
    --muted-bg: #25262b;
    --border: #2d2f36;
    --accent: #6ea8fe;
    --link: #93c5fd;
    --code-bg: #25262b;
    --blockquote-bg: #1f2024;
    --side-bg: #17181b;
    --toolbar-bg: #1a1b1e;
    --hover-bg: #2a2c33;
    --input-bg: #25262b;
  }
  :global(html), :global(body) {
    margin: 0;
    height: 100%;
    background: var(--bg);
    color: var(--fg);
    overflow: hidden;
  }
  :global(mark.find-hit) { background: #fde68a; color: #111; padding: 0; border-radius: 2px; }
  :global(mark.find-hit.active) { background: #f59e0b; color: #111; }

  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: .75rem;
    padding: .4rem .6rem;
    background: var(--toolbar-bg);
    border-bottom: 1px solid var(--border);
    user-select: none;
    -webkit-app-region: drag;
  }
  .toolbar button { -webkit-app-region: no-drag; }
  .left, .right { display: flex; align-items: center; gap: .35rem; }
  .middle { flex: 1 1 auto; display: flex; align-items: center; gap: .4rem; min-width: 0; }
  .path { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .muted { color: var(--muted); font-size: 12px; }
  .dot { color: var(--accent); }
  .zoom { font-size: 12px; color: var(--muted); min-width: 3em; text-align: center; }
  button {
    background: none;
    border: 1px solid transparent;
    color: var(--fg);
    padding: .25rem .55rem;
    border-radius: 5px;
    cursor: pointer;
    font: inherit;
  }
  button:hover { background: var(--hover-bg); }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .seg button { border: 0; border-radius: 0; padding: .25rem .65rem; }
  .seg button.active { background: var(--accent); color: white; }

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
