<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { settings, effectiveDark } from "./settings-store.svelte";

  interface Props {
    source: string;
    onChange?: (s: string) => void;
    onSave?: () => void;
  }
  let { source = "", onChange, onSave }: Props = $props();

  let host: HTMLDivElement | undefined = $state();
  let crepe: any = null;
  // True while we're dispatching an external doc swap (file reload, AI edit
  // arriving while clean, tab switch). Suppresses our own listener echo.
  let applyingExternal = false;
  // Last markdown Crepe emitted to us, set on first mount and on every
  // subsequent edit. Compared against the incoming `source` prop to decide
  // whether a prop change is "external" or just our own edit echoing back.
  let lastEmitted = "";

  onMount(() => { void mount(); });

  async function mount() {
    if (!host) return;
    // Functional Crepe chrome only (selection toolbar, slash menu, table
    // controls). We deliberately *don't* import frame.css — its opinionated
    // typography fights the Viewer look. Content styles below mirror Viewer's
    // .prose so view ↔ smart-edit feels visually continuous.
    await import("@milkdown/crepe/theme/common/style.css");
    const { Crepe } = await import("@milkdown/crepe");

    const initial = source;
    lastEmitted = initial;
    const instance = new Crepe({
      root: host,
      defaultValue: initial,
    });

    instance.on((listener: any) => {
      listener.markdownUpdated((_ctx: any, md: string) => {
        if (applyingExternal) return;
        if (md === lastEmitted) return;
        lastEmitted = md;
        onChange?.(md);
      });
    });

    await instance.create();
    crepe = instance;
    host?.addEventListener("keydown", onHostKeydown);
  }

  function onHostKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      onSave?.();
    }
  }

  // Reflect external `source` updates into the editor without re-firing
  // onChange. Triggered by tab switches, file-reload while clean, or AI
  // edits arriving while the editor isn't dirty.
  $effect(() => {
    if (!crepe) return;
    if (source === lastEmitted) return;
    applyingExternal = true;
    const md = source;
    import("@milkdown/kit/utils").then(({ replaceAll }) => {
      try {
        crepe.editor.action(replaceAll(md));
        lastEmitted = md;
      } finally {
        applyingExternal = false;
      }
    }).catch(() => {
      applyingExternal = false;
    });
  });

  onDestroy(() => {
    host?.removeEventListener("keydown", onHostKeydown);
    crepe?.destroy().catch(() => { /* noop */ });
  });
</script>

<div
  class="smart-editor-host"
  class:full-width={settings.s.fullWidth}
  class:center-headings={settings.s.centerHeadings}
  style="--zoom: {settings.s.zoom}; --font-size: {settings.s.fontSize}px; --font-family: {settings.s.fontFamily}; --content-width: {settings.s.contentWidthCh}ch;"
  bind:this={host}
></div>

<style>
  /* Outer scroll container — mirrors Viewer's .viewer block. The faint
     --bg-edit tint (defined globally in +page.svelte) is the only visual
     cue distinguishing edit surface from read surface. */
  .smart-editor-host {
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 3rem 0 5rem;
    font-size: calc(var(--font-size, 16px) * var(--zoom, 1));
    font-family: var(--font-family);
    line-height: 1.65;
    color: var(--fg);
    background: var(--bg-edit, var(--bg));
    text-align: left;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    font-feature-settings: "kern", "liga", "calt", "ss01";
  }

  /* Crepe chrome vars. Crepe's common/*.css reads these for toolbar bg,
     slash-menu surface, block-handle color, table controls, etc. We define
     them here (instead of importing frame.css / frame-dark.css) so the
     chrome auto-switches with the app's --bg / --fg vars and doesn't pull
     in Noto Sans / Noto Serif which fight Viewer's typography. */
  .smart-editor-host :global(.milkdown) {
    --crepe-color-background: var(--bg-edit);
    --crepe-color-on-background: var(--fg);
    --crepe-color-surface: var(--bg-elevated);
    --crepe-color-surface-low: var(--muted-bg);
    --crepe-color-on-surface: var(--fg);
    --crepe-color-on-surface-variant: var(--muted-strong);
    --crepe-color-outline: var(--border-strong);
    --crepe-color-primary: var(--accent);
    --crepe-color-secondary: var(--muted-bg);
    --crepe-color-on-secondary: var(--fg);
    --crepe-color-inverse: var(--bg-elevated);
    --crepe-color-on-inverse: var(--fg);
    --crepe-color-inline-code: var(--fg);
    --crepe-color-error: #f85149;
    --crepe-color-hover: var(--hover-bg);
    --crepe-color-selected: var(--accent-soft);
    --crepe-color-inline-area: var(--code-inline-bg);
    --crepe-font-title: var(--font-family);
    --crepe-font-default: var(--font-family);
    --crepe-font-code: ui-monospace, SFMono-Regular, Menlo, Consolas, "Cascadia Mono", monospace;
    --crepe-shadow-1: var(--shadow-sm);
    --crepe-shadow-2: var(--shadow-md);

    background: transparent;
    box-shadow: none;
    border: 0;
    border-radius: 0;
    padding: 0;
    margin: 0;
  }
  /* Belt-and-braces for floating popups Crepe portals to <body> (selection
     toolbar, slash menu, link tooltip). They aren't descendants of our host
     so the var scope above doesn't reach them — define on <body> too. */
  :global(body) {
    --crepe-color-background: var(--bg-edit);
    --crepe-color-on-background: var(--fg);
    --crepe-color-surface: var(--bg-elevated);
    --crepe-color-surface-low: var(--muted-bg);
    --crepe-color-on-surface: var(--fg);
    --crepe-color-on-surface-variant: var(--muted-strong);
    --crepe-color-outline: var(--border-strong);
    --crepe-color-primary: var(--accent);
    --crepe-color-secondary: var(--muted-bg);
    --crepe-color-on-secondary: var(--fg);
    --crepe-color-inverse: var(--bg-elevated);
    --crepe-color-on-inverse: var(--fg);
    --crepe-color-inline-code: var(--fg);
    --crepe-color-error: #f85149;
    --crepe-color-hover: var(--hover-bg);
    --crepe-color-selected: var(--accent-soft);
    --crepe-color-inline-area: var(--code-inline-bg);
    --crepe-font-title: var(--font-family);
    --crepe-font-default: var(--font-family);
    --crepe-font-code: ui-monospace, SFMono-Regular, Menlo, Consolas, "Cascadia Mono", monospace;
    --crepe-shadow-1: var(--shadow-sm);
    --crepe-shadow-2: var(--shadow-md);
  }
  .smart-editor-host :global(.ProseMirror) {
    max-width: var(--content-width);
    margin: 0 auto;
    padding: 0 clamp(1.25rem, 5vw, 3.5rem);
    text-align: left;
    outline: none;
    color: var(--fg);
    background: transparent;
    min-height: 60vh;
  }
  .smart-editor-host.full-width :global(.ProseMirror) { max-width: none; }
  .smart-editor-host :global(.ProseMirror > *:first-child) { margin-top: 0; }
  .smart-editor-host :global(.ProseMirror > *:last-child) { margin-bottom: 0; }

  .smart-editor-host.center-headings :global(.ProseMirror h1),
  .smart-editor-host.center-headings :global(.ProseMirror h2),
  .smart-editor-host.center-headings :global(.ProseMirror h3),
  .smart-editor-host.center-headings :global(.ProseMirror h4),
  .smart-editor-host.center-headings :global(.ProseMirror h5),
  .smart-editor-host.center-headings :global(.ProseMirror h6) {
    text-align: center !important;
  }

  /* ─── Headings (mirror Viewer) ──────────────────────────── */
  .smart-editor-host :global(.ProseMirror h1),
  .smart-editor-host :global(.ProseMirror h2),
  .smart-editor-host :global(.ProseMirror h3),
  .smart-editor-host :global(.ProseMirror h4),
  .smart-editor-host :global(.ProseMirror h5),
  .smart-editor-host :global(.ProseMirror h6) {
    display: block;
    text-align: left;
    line-height: 1.25;
    margin-top: 2em;
    margin-bottom: .6em;
    letter-spacing: -0.012em;
    font-weight: 600;
    color: var(--fg-strong);
    padding-left: 0;
    padding-right: 0;
  }
  .smart-editor-host :global(.ProseMirror h1) {
    font-size: 2.1em;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-top: .2em;
    margin-bottom: .5em;
  }
  .smart-editor-host :global(.ProseMirror h2) {
    font-size: 1.55em;
    font-weight: 600;
    letter-spacing: -0.015em;
    margin-top: 2.2em;
    padding-bottom: .35em;
    border-bottom: 1px solid var(--border);
  }
  .smart-editor-host :global(.ProseMirror h3) { font-size: 1.22em; margin-top: 1.7em; }
  .smart-editor-host :global(.ProseMirror h4) { font-size: 1.05em; margin-top: 1.5em; }
  .smart-editor-host :global(.ProseMirror h5) { font-size: 1em; margin-top: 1.3em; }
  .smart-editor-host :global(.ProseMirror h6) {
    font-size: .82em;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .08em;
    font-weight: 600;
    margin-top: 1.5em;
  }

  /* ─── Paragraph & inline ──────────────────────────────── */
  .smart-editor-host :global(.ProseMirror p) { margin: .85em 0; }
  .smart-editor-host :global(.ProseMirror strong) { font-weight: 600; color: var(--fg-strong); }
  .smart-editor-host :global(.ProseMirror em) { font-style: italic; }
  .smart-editor-host :global(.ProseMirror del),
  .smart-editor-host :global(.ProseMirror s) { color: var(--muted); }

  /* ─── Links ──────────────────────────────────────────── */
  .smart-editor-host :global(.ProseMirror a) {
    color: var(--link);
    text-decoration: none;
    text-underline-offset: 2px;
  }
  .smart-editor-host :global(.ProseMirror a:hover) { text-decoration: underline; }

  /* ─── Code (inline + block) ──────────────────────────── */
  .smart-editor-host :global(.ProseMirror code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Cascadia Mono", monospace;
    background: var(--code-inline-bg);
    padding: .12em .4em;
    border-radius: 4px;
    font-size: .88em;
  }
  .smart-editor-host :global(.ProseMirror pre) {
    background: var(--code-bg);
    padding: 1em 1.1em;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1.1em 0;
    font-size: .88em;
    line-height: 1.55;
    border: 1px solid var(--border);
  }
  .smart-editor-host :global(.ProseMirror pre > code) {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: 1em;
    color: inherit;
  }

  /* ─── Blockquote ─────────────────────────────────────── */
  .smart-editor-host :global(.ProseMirror blockquote) {
    border-left: 3px solid var(--border);
    margin: 1em 0;
    padding: .25em 1.1em;
    color: var(--muted);
    background: transparent;
  }
  .smart-editor-host :global(.ProseMirror blockquote > :first-child) { margin-top: 0; }
  .smart-editor-host :global(.ProseMirror blockquote > :last-child)  { margin-bottom: 0; }
  .smart-editor-host :global(.ProseMirror blockquote p) { margin: .5em 0; }

  /* ─── Lists ──────────────────────────────────────────── */
  .smart-editor-host :global(.ProseMirror ul),
  .smart-editor-host :global(.ProseMirror ol) {
    padding-left: 1.6em;
    margin: .85em 0;
  }
  .smart-editor-host :global(.ProseMirror li) { margin: .25em 0; }
  .smart-editor-host :global(.ProseMirror li > p) { margin: .25em 0; }
  .smart-editor-host :global(.ProseMirror ul ul),
  .smart-editor-host :global(.ProseMirror ol ol),
  .smart-editor-host :global(.ProseMirror ul ol),
  .smart-editor-host :global(.ProseMirror ol ul) { margin: .15em 0; }

  /* ─── Tables ─────────────────────────────────────────── */
  .smart-editor-host :global(.ProseMirror table) {
    border-collapse: collapse;
    margin: 1em 0;
    overflow: auto;
    display: block;
  }
  .smart-editor-host :global(.ProseMirror th),
  .smart-editor-host :global(.ProseMirror td) {
    border: 1px solid var(--border);
    padding: .45em .75em;
  }
  .smart-editor-host :global(.ProseMirror th) {
    background: var(--muted-bg);
    font-weight: 600;
  }
  .smart-editor-host :global(.ProseMirror tr:nth-child(2n) td) {
    background: var(--zebra-bg);
  }

  /* ─── Horizontal rule ────────────────────────────────── */
  .smart-editor-host :global(.ProseMirror hr) {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 2em 0;
  }
</style>
