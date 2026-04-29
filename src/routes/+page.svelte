<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import type { UnlistenFn } from "@tauri-apps/api/event";
  import { api } from "$lib/api";
  import { settings, effectiveDark } from "$lib/settings-store.svelte";
  import { tabs } from "$lib/tabs-store.svelte";
  import Viewer from "$lib/Viewer.svelte";
  import Editor from "$lib/Editor.svelte";
  import LeftPanel from "$lib/LeftPanel.svelte";
  import TabBar from "$lib/TabBar.svelte";
  import Find from "$lib/Find.svelte";
  import Settings from "$lib/Settings.svelte";

  type Mode = "view" | "edit" | "split";

  let mode = $state<Mode>("view");
  let findOpen = $state(false);
  let settingsOpen = $state(false);
  let fileMenuOpen = $state(false);
  let viewerEl: HTMLElement | null = $state(null);
  let unlistenChange: UnlistenFn | null = null;
  let unlistenCli: UnlistenFn | null = null;
  let unlistenDrop: UnlistenFn | null = null;
  let unlistenOpenFile: UnlistenFn | null = null;

  // Convenience derived state from active tab
  let active = $derived(tabs.active);
  let path = $derived(active?.path ?? null);
  let source = $derived(active?.source ?? "");
  let dirty = $derived(active?.dirty ?? false);
  let cwd = $derived(path ? path.replace(/[\\/][^\\/]*$/, "") : null);

  // Theme application
  $effect(() => {
    const dark = effectiveDark(settings.s.theme);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  });

  // Re-arm watcher whenever the active tab changes
  $effect(() => {
    const p = path;
    (async () => {
      await api.unwatchFile();
      if (p) await api.watchFile(p);
    })();
  });

  // Keep document title in sync with active tab
  $effect(() => {
    const name = path ? path.split(/[\\/]/).pop() : null;
    document.title = name ? `${name} — md-reader` : "md-reader";
  });

  async function openInTab(p: string) {
    try {
      await tabs.openOrFocus(p);
    } catch (e) {
      console.error(e);
      alert(`Failed to open file: ${e}`);
    }
  }

  async function pickAndOpen() {
    const p = await api.pickFile();
    if (p) await openInTab(p);
  }

  async function save() {
    if (!active) return;
    await api.saveFile(active.path, active.source);
    tabs.markActiveSaved();
  }

  async function closeActiveTab() {
    if (active) tabs.close(active.id);
  }

  async function openRecent(p: string) {
    fileMenuOpen = false;
    await openInTab(p);
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

  function onEditorChange(s: string) {
    tabs.setActiveSource(s);
  }

  function onKey(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); pickAndOpen(); }
    else if (mod && e.key.toLowerCase() === "t") { e.preventDefault(); pickAndOpen(); }
    else if (mod && e.key.toLowerCase() === "w") { e.preventDefault(); closeActiveTab(); }
    else if (mod && e.key === "Tab" && !e.shiftKey) { e.preventDefault(); tabs.next(); }
    else if (mod && e.key === "Tab" && e.shiftKey) { e.preventDefault(); tabs.prev(); }
    else if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); settings.set("showFiles", !settings.s.showFiles); }
    else if (mod && e.key === ",") { e.preventDefault(); settingsOpen = true; }
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
      e.preventDefault();
      import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => {
        try { (getCurrentWebview() as any).openDevtools?.(); } catch { /* noop */ }
      });
    } else if (e.key === "Escape") {
      findOpen = false;
      settingsOpen = false;
      fileMenuOpen = false;
    }
  }

  onMount(async () => {
    await settings.init();

    unlistenCli = await api.onOpenFromCli((paths) => {
      if (paths[0]) openInTab(paths[0]);
    });

    // Listen for the file-open event the spawned window receives after tear-out.
    unlistenOpenFile = await api.onOpenFileEvent((p) => {
      console.log("[md-reader] open-file event:", p);
      if (p) openInTab(p);
    });

    // Tell the Rust side that this window is ready to receive events.
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit("md-reader://window-ready");
    } catch (e) {
      console.warn("[md-reader] window-ready emit failed", e);
    }

    unlistenChange = await api.onFileChanged(async (changedPath) => {
      // Only refresh if the changed file is the active one (the only one we watch).
      if (active && changedPath === active.path) {
        try {
          const refreshed = await api.openFile(active.path);
          if (refreshed.content !== active.source) {
            tabs.setActiveSourceFromDisk(refreshed.content);
          }
        } catch { /* atomic-save transient */ }
      }
    });

    // Native OS file-drop on the window — opens each .md as a new tab.
    // We log a hint on every drop event so it's easy to debug from DevTools
    // console if a drop ever appears not to trigger.
    unlistenDrop = await getCurrentWebview().onDragDropEvent((evt) => {
      if (evt.payload.type === "drop") {
        console.log("[md-reader] drop:", evt.payload.paths);
        const dropped = evt.payload.paths ?? [];
        let opened = 0;
        for (const p of dropped) {
          if (/\.(md|markdown|mdown|mkd|mkdn|txt)$/i.test(p)) {
            openInTab(p);
            opened++;
          }
        }
        if (dropped.length > 0 && opened === 0) {
          console.warn("[md-reader] drop ignored — no markdown extension:", dropped);
        }
      }
    });

    // Belt-and-suspenders: HTML5-level dragover preventDefault so the OS-level
    // Tauri drop handler always wins over any in-page drag-drop machinery.
    dragSwallowers = (e: DragEvent) => {
      const items = e.dataTransfer?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind === "file") { e.preventDefault(); return; }
      }
    };
    window.addEventListener("dragover", dragSwallowers);
    window.addEventListener("drop", dragSwallowers);

    window.addEventListener("keydown", onKey);

    // Initial-state determination, in priority order:
    // 1. Explorer double-click → onOpenFromCli (handled above)
    // 2. Tear-out window → onOpenFileEvent (handled above)
    // 3. Restore previously-open tabs from settings (only on the main window)
    // 4. Otherwise: empty state
    const isMainWindow = (typeof window !== "undefined")
      && (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "main";
    if (isMainWindow && tabs.tabs.length === 0) {
      await tabs.restore();
    }
  });

  let dragSwallowers: ((e: DragEvent) => void) | null = null;

  onDestroy(() => {
    unlistenCli?.();
    unlistenChange?.();
    unlistenDrop?.();
    unlistenOpenFile?.();
    window.removeEventListener("keydown", onKey);
    if (dragSwallowers) {
      window.removeEventListener("dragover", dragSwallowers);
      window.removeEventListener("drop", dragSwallowers);
    }
  });
</script>

<svelte:head>
  <title>md-reader</title>
</svelte:head>

<div class="shell">
  <header class="toolbar">
    <div class="left">
      <button class="file-btn" onclick={() => (fileMenuOpen = !fileMenuOpen)} title="File menu" aria-haspopup="menu" aria-expanded={fileMenuOpen}>
        File <span class="caret">▾</span>
      </button>
      <div class="seg">
        <button class:active={mode === "view"} onclick={() => setMode("view")}>View</button>
        <button class:active={mode === "split"} onclick={() => setMode("split")}>Split</button>
        <button class:active={mode === "edit"} onclick={() => setMode("edit")}>Edit</button>
      </div>
      <div class="seg panel-toggles" title="Toggle side-panel sections">
        <button
          class:active={settings.s.showFiles}
          onclick={() => settings.set("showFiles", !settings.s.showFiles)}
          title="Files (Ctrl+B)"
          aria-label="Toggle files panel"
        >📁</button>
        <button
          class:active={settings.s.showToc}
          onclick={() => settings.set("showToc", !settings.s.showToc)}
          title="Outline"
          aria-label="Toggle outline panel"
        >📑</button>
      </div>
    </div>
    <div class="middle">
      {#if path}
        <span class="path" title={path}>{path}</span>
        {#if dirty}<span class="dot" title="Unsaved">●</span>{/if}
      {:else}
        <span class="muted">No file open — Ctrl+T to open in new tab, or drop a .md file here.</span>
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

  <TabBar onNewTab={pickAndOpen} />

  <div class="body">
    {#if mode !== "edit"}
      <LeftPanel
        {source}
        {cwd}
        activePath={path}
        onOpenFile={(p) => openInTab(p)}
      />
    {/if}
    <main class="content" bind:this={viewerEl}>
      {#if !active}
        <div class="empty-state">
          <div class="empty-glyph">⌘</div>
          <h2>No file open</h2>
          <p>Press <kbd>Ctrl</kbd>+<kbd>T</kbd> to open one, or drop a <code>.md</code> file onto the window.</p>
          {#if settings.s.recentFiles.length > 0}
            <div class="empty-recent">
              <div class="empty-label">Recent</div>
              {#each settings.s.recentFiles.slice(0, 5) as r}
                <button class="empty-recent-item" onclick={() => openInTab(r)} title={r}>
                  <span>{r.split(/[\\/]/).pop()}</span>
                  <span class="dim">{r.replace(/[\\/][^\\/]*$/, "").split(/[\\/]/).slice(-2).join("/")}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else if mode === "edit"}
        <Editor source={active.source} onChange={onEditorChange} onSave={save} />
      {:else if mode === "split"}
        <div class="split">
          <Editor source={active.source} onChange={onEditorChange} onSave={save} />
          <Viewer source={active.source} basePath={active.path} {mode} lastChangeFromDisk={active.diskTick} />
        </div>
      {:else}
        <Viewer source={active.source} basePath={active.path} {mode} lastChangeFromDisk={active.diskTick} />
      {/if}
      <Find bind:open={findOpen} target={viewerEl} />
    </main>
  </div>
</div>

<Settings bind:open={settingsOpen} />

<!-- File menu rendered at root level so it escapes the toolbar's
     backdrop-filter stacking context (which was making it invisible) -->
{#if fileMenuOpen}
  <div class="menu-backdrop" onclick={() => (fileMenuOpen = false)} role="presentation"></div>
  <div class="menu file-menu" role="menu">
    <button class="menu-item" onclick={() => { fileMenuOpen = false; pickAndOpen(); }}>
      <span>Open file…</span><span class="kbd">Ctrl O</span>
    </button>
    <button class="menu-item" onclick={() => { fileMenuOpen = false; pickAndOpen(); }}>
      <span>New tab</span><span class="kbd">Ctrl T</span>
    </button>
    {#if settings.s.recentFiles.length > 0}
      <div class="menu-sep"></div>
      <div class="menu-label">Recent</div>
      {#each settings.s.recentFiles.slice(0, 8) as r}
        <button class="menu-item recent" onclick={() => openRecent(r)} title={r}>
          <span class="recent-name">{r.split(/[\\/]/).pop()}</span>
          <span class="recent-dir">{r.replace(/[\\/][^\\/]*$/, "").split(/[\\/]/).slice(-2).join("/")}</span>
        </button>
      {/each}
    {/if}
    <div class="menu-sep"></div>
    <button class="menu-item" disabled={!path} onclick={() => { fileMenuOpen = false; closeActiveTab(); }}>
      <span>Close tab</span><span class="kbd">Ctrl W</span>
    </button>
    <button class="menu-item" onclick={() => { fileMenuOpen = false; settingsOpen = true; }}>
      <span>Settings…</span><span class="kbd">Ctrl ,</span>
    </button>
  </div>
{/if}

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

  /* Always-visible scrollbars — subtle but actually present, so you can see
     position in long docs at a glance. Slightly bolder on hover. */
  :global(::-webkit-scrollbar) { width: 12px; height: 12px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) {
    background-color: rgba(120, 120, 128, 0.45);
    border: 3px solid transparent;
    border-radius: 8px;
    background-clip: padding-box;
    min-height: 24px;
  }
  :global(::-webkit-scrollbar-thumb:hover) {
    background-color: rgba(120, 120, 128, 0.7);
    background-clip: padding-box;
  }
  :global(::-webkit-scrollbar-thumb:active) {
    background-color: rgba(120, 120, 128, 0.85);
    background-clip: padding-box;
  }
  :global(::-webkit-scrollbar-corner) { background: transparent; }

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
  /* Mark all interactive zones as no-drag so click events reach buttons.
     The .middle (centered title) stays as the drag-region. */
  .toolbar .left,
  .toolbar .left *,
  .toolbar .right,
  .toolbar .right * { -webkit-app-region: no-drag; }

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

  /* File button & menu */
  .file-btn .caret { font-size: 9px; margin-left: .25em; opacity: .7; }
  :global(.menu-backdrop) {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: transparent;
  }
  :global(.file-menu) {
    position: fixed;
    top: 50px;
    left: 16px;
    z-index: 51;
    min-width: 280px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    padding: 4px;
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
  }
  .menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 30px;
    padding: 0 .65rem;
    font-size: 13px;
    color: var(--fg);
    border-radius: var(--radius-sm);
    text-align: left;
  }
  .menu-item:hover:not([disabled]) { background: var(--accent); color: white; }
  .menu-item:hover:not([disabled]) .kbd,
  .menu-item:hover:not([disabled]) .recent-dir { color: rgba(255,255,255,0.85); }
  .menu-item[disabled] { opacity: .4; cursor: default; }
  .menu-item.recent {
    flex-direction: column;
    align-items: flex-start;
    height: auto;
    padding: .35rem .65rem;
    gap: 1px;
  }
  .recent-name { font-size: 13px; }
  .recent-dir { font-size: 11px; color: var(--muted); }
  .menu-label {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--muted);
    padding: .35rem .65rem .15rem;
    font-weight: 600;
  }
  .menu-sep { height: 1px; background: var(--border); margin: 4px 0; }
  .kbd {
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 11px;
    color: var(--muted);
    margin-left: 1rem;
  }

  /* Empty state — shown when no tabs are open */
  .empty-state {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--muted);
    gap: .5rem;
    padding: 2rem;
    background: var(--bg);
  }
  .empty-glyph {
    font-size: 48px;
    color: var(--border-strong, var(--border));
    margin-bottom: .5rem;
    opacity: .6;
  }
  .empty-state h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 500;
    color: var(--fg);
  }
  .empty-state p {
    margin: 0;
    font-size: 13px;
  }
  .empty-state kbd {
    background: var(--muted-bg);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 0 .35em;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: .85em;
  }
  .empty-state code {
    background: var(--code-inline-bg);
    padding: .12em .35em;
    border-radius: 4px;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: .9em;
  }
  .empty-recent {
    margin-top: 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: min(420px, 80%);
  }
  .empty-label {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--muted);
    font-weight: 600;
    text-align: left;
    padding: 0 .5rem .25rem;
  }
  .empty-recent-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    align-items: flex-start;
    padding: .45rem .65rem;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--fg);
    text-align: left;
    cursor: pointer;
    font-size: 13px;
  }
  .empty-recent-item:hover { background: var(--accent); color: white; }
  .empty-recent-item:hover .dim { color: rgba(255,255,255,0.85); }
  .empty-recent-item .dim { font-size: 11px; color: var(--muted); }
</style>
