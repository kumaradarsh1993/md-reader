<script lang="ts">
  import { settings } from "./settings-store.svelte";
  import Toc from "./Toc.svelte";
  import FileBrowser from "./FileBrowser.svelte";

  interface Props {
    source: string;
    cwd: string | null;
    activePath: string | null;
    onOpenFile: (path: string) => void;
  }
  let { source, cwd, activePath, onOpenFile }: Props = $props();

  let dragging = $state(false);

  function startResize(e: PointerEvent) {
    e.preventDefault();
    dragging = true;
    const startX = e.clientX;
    const startWidth = settings.s.panelWidth;
    const MIN = 180;
    const MAX = 520;

    function onMove(ev: PointerEvent) {
      const delta = ev.clientX - startX;
      const next = Math.min(MAX, Math.max(MIN, startWidth + delta));
      settings.set("panelWidth", next);
    }
    function onUp() {
      dragging = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Visible only if at least one section is on
  let anyVisible = $derived(settings.s.showFiles || settings.s.showToc);
</script>

{#if anyVisible}
  <aside class="panel" style="width: {settings.s.panelWidth}px;">
    <div class="panel-stack">
      {#if settings.s.showFiles}
        <section class="section files-section" class:flex-1={!settings.s.showToc}>
          <header class="section-head">
            <span class="title">Files</span>
            <button class="hide" onclick={() => settings.set("showFiles", false)} title="Hide files">×</button>
          </header>
          <div class="section-body">
            <FileBrowser {cwd} {activePath} onOpen={onOpenFile} />
          </div>
        </section>
      {/if}

      {#if settings.s.showToc}
        <section class="section toc-section" class:flex-1={!settings.s.showFiles}>
          <header class="section-head">
            <span class="title">Outline</span>
            <button class="hide" onclick={() => settings.set("showToc", false)} title="Hide outline">×</button>
          </header>
          <div class="section-body">
            <Toc {source} />
          </div>
        </section>
      {/if}
    </div>

    <div
      class="resizer"
      class:dragging
      onpointerdown={startResize}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
    ></div>
  </aside>
{/if}

<style>
  .panel {
    position: relative;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    background: var(--side-bg);
    display: flex;
    height: 100%;
    min-width: 180px;
    max-width: 520px;
  }
  .panel-stack {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    overflow: hidden;
  }
  .section {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1 1 50%;
    overflow: hidden;
  }
  .section + .section {
    border-top: 1px solid var(--border);
  }
  .section.flex-1 { flex: 1 1 100%; }
  .section.files-section { flex-basis: 45%; }
  .section.toc-section { flex-basis: 55%; }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .55rem .85rem .35rem;
    flex-shrink: 0;
  }
  .title {
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--muted);
  }
  .hide {
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    font-size: 14px;
    line-height: 1;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .hide:hover { background: var(--hover-bg); color: var(--fg); }
  .section-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .section-body :global(.toc),
  .section-body :global(.file-browser) {
    flex: 1 1 auto;
    border-right: 0;
    width: 100%;
  }

  .resizer {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
  }
  .resizer:hover,
  .resizer.dragging {
    background: var(--accent);
    opacity: .25;
  }
</style>
