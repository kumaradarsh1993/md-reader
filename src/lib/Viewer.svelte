<script lang="ts">
  import { onMount, tick } from "svelte";
  import { api } from "./api";
  import { settings, effectiveDark } from "./settings-store.svelte";
  import { postRender } from "./post-render";

  interface Props { source: string; basePath: string }
  let { source = "", basePath = "" }: Props = $props();

  let container: HTMLDivElement;
  let html = $state("");
  let lastScroll = 0;

  // Effective dark mode (reactive on theme + system change)
  let dark = $derived(effectiveDark(settings.s.theme));

  $effect(() => {
    // Re-render whenever source or theme changes.
    const src = source;
    const isDark = dark;
    let cancelled = false;
    (async () => {
      const rendered = await api.renderMarkdown(src, isDark);
      if (cancelled) return;
      // Preserve scroll position across live-reload re-renders.
      lastScroll = container?.scrollTop ?? 0;
      html = rendered;
      await tick();
      if (container) {
        container.scrollTop = lastScroll;
        await postRender(container, { dark: isDark });
        rewriteRelativeImages(container, basePath);
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  function rewriteRelativeImages(root: HTMLElement, base: string) {
    if (!base) return;
    const dir = base.replace(/[\\/][^\\/]*$/, "");
    const imgs = root.querySelectorAll<HTMLImageElement>("img");
    for (const img of imgs) {
      const src = img.getAttribute("src");
      if (!src) continue;
      if (/^(https?:|data:|file:|asset:)/i.test(src)) continue;
      // Use Tauri's asset protocol via convertFileSrc so local images render.
      // Imported lazily to keep startup light.
      import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
        const sep = dir.includes("\\") ? "\\" : "/";
        img.src = convertFileSrc(`${dir}${sep}${src}`);
      });
    }
  }
</script>

<div
  class="viewer"
  class:max-narrow={settings.s.maxWidth === "narrow"}
  class:max-wide={settings.s.maxWidth === "wide"}
  class:max-full={settings.s.maxWidth === "full"}
  style="--zoom: {settings.s.zoom}; --font-size: {settings.s.fontSize}px; --font-family: {settings.s.fontFamily};"
  bind:this={container}
>
  {@html html}
</div>

<style>
  .viewer {
    flex: 1 1 auto;
    overflow: auto;
    padding: 2rem clamp(1rem, 5vw, 4rem);
    font-size: calc(var(--font-size, 16px) * var(--zoom, 1));
    font-family: var(--font-family);
    line-height: 1.6;
    color: var(--fg);
    background: var(--bg);
  }
  .viewer :global(> *) {
    margin-left: auto;
    margin-right: auto;
  }
  .max-narrow :global(> *) { max-width: 56ch; }
  .max-wide :global(> *)   { max-width: 86ch; }
  .max-full :global(> *)   { max-width: 100%; }

  .viewer :global(h1),
  .viewer :global(h2),
  .viewer :global(h3),
  .viewer :global(h4) {
    font-weight: 600;
    line-height: 1.25;
    margin: 1.6em 0 0.6em;
  }
  .viewer :global(h1) { font-size: 1.9em; border-bottom: 1px solid var(--border); padding-bottom: .25em; }
  .viewer :global(h2) { font-size: 1.5em; border-bottom: 1px solid var(--border); padding-bottom: .2em; }
  .viewer :global(h3) { font-size: 1.25em; }
  .viewer :global(p)  { margin: .8em 0; }
  .viewer :global(a)  { color: var(--link); }
  .viewer :global(code) {
    font-family: ui-monospace, Menlo, Consolas, "Cascadia Mono", monospace;
    background: var(--code-bg);
    padding: .12em .35em;
    border-radius: 4px;
    font-size: .92em;
  }
  .viewer :global(pre) {
    background: var(--code-bg);
    padding: .9em 1em;
    border-radius: 8px;
    overflow-x: auto;
  }
  .viewer :global(pre > code) { background: transparent; padding: 0; }
  .viewer :global(blockquote) {
    border-left: 3px solid var(--accent);
    margin: 1em 0;
    padding: .25em 1em;
    color: var(--muted);
    background: var(--blockquote-bg);
  }
  .viewer :global(table) {
    border-collapse: collapse;
    margin: 1em 0;
    width: 100%;
  }
  .viewer :global(th),
  .viewer :global(td) {
    border: 1px solid var(--border);
    padding: .45em .8em;
  }
  .viewer :global(th) { background: var(--muted-bg); }
  .viewer :global(img) { max-width: 100%; height: auto; }
  .viewer :global(.mermaid-rendered) { display: flex; justify-content: center; margin: 1em 0; }
  .viewer :global(.mermaid-error) { color: #c00; font-family: monospace; padding: .5em; }

  /* GFM alerts (NOTE/TIP/WARNING/CAUTION/IMPORTANT) */
  .viewer :global(.markdown-alert) {
    border-left: 4px solid var(--accent);
    padding: .6em 1em;
    margin: 1em 0;
    background: var(--blockquote-bg);
    border-radius: 4px;
  }
</style>
