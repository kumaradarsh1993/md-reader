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

  let dark = $derived(effectiveDark(settings.s.theme));

  $effect(() => {
    const src = source;
    const isDark = dark;
    let cancelled = false;
    (async () => {
      const rendered = await api.renderMarkdown(src, isDark);
      if (cancelled) return;
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
      import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
        const sep = dir.includes("\\") ? "\\" : "/";
        img.src = convertFileSrc(`${dir}${sep}${src}`);
      });
    }
  }
</script>

<div
  class="viewer"
  class:full-width={settings.s.fullWidth}
  class:center-headings={settings.s.centerHeadings}
  style="--zoom: {settings.s.zoom}; --font-size: {settings.s.fontSize}px; --font-family: {settings.s.fontFamily}; --content-width: {settings.s.contentWidthCh}ch;"
  bind:this={container}
>
  <article class="prose">{@html html}</article>
</div>

<style>
  /* Outer scroll container — full width of the parent flex slot */
  .viewer {
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 3rem 0 5rem;
    font-size: calc(var(--font-size, 16px) * var(--zoom, 1));
    font-family: var(--font-family);
    line-height: 1.65;
    color: var(--fg);
    background: var(--bg);
    text-align: left;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    font-feature-settings: "kern", "liga", "calt", "ss01";
  }

  /* The actual content column — max-width capped, centered horizontally.
     This is the only block that handles centering. Children just flow normally. */
  .prose {
    max-width: var(--content-width);
    margin: 0 auto;
    padding: 0 clamp(1.25rem, 5vw, 3.5rem);
    text-align: left;
  }
  .viewer.full-width .prose { max-width: none; }

  .prose :global(> *:first-child) { margin-top: 0; }
  .prose :global(> *:last-child)  { margin-bottom: 0; }

  .viewer.center-headings :global(h1),
  .viewer.center-headings :global(h2),
  .viewer.center-headings :global(h3),
  .viewer.center-headings :global(h4),
  .viewer.center-headings :global(h5),
  .viewer.center-headings :global(h6) {
    text-align: center !important;
  }

  /* ─── Headings ─────────────────────────────────────────── */
  .viewer :global(h1),
  .viewer :global(h2),
  .viewer :global(h3),
  .viewer :global(h4),
  .viewer :global(h5),
  .viewer :global(h6) {
    /* Nuclear reset — kill any inherited offset, indent, or alignment trick */
    display: block !important;
    text-align: left !important;
    text-indent: 0 !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    padding-inline: 0 !important;
    /* Block centering still works via the > * rule below */
    line-height: 1.25;
    margin-top: 2em;
    margin-bottom: .6em;
    letter-spacing: -0.012em;
    font-weight: 600;
    color: var(--fg-strong);
  }
  /* Comrak's header_ids feature emits an empty <a class="anchor"> beside or inside
     each heading. We don't want it visible, but it must remain a layout target so the
     TOC can scrollIntoView. Collapse it to a 0×0 inline-block. */
  .viewer :global(a.anchor) {
    display: inline-block !important;
    width: 0 !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
  .viewer :global(h1) {
    font-size: 2.1em;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-top: .2em;
    margin-bottom: .5em;
  }
  .viewer :global(h2) {
    font-size: 1.55em;
    font-weight: 600;
    letter-spacing: -0.015em;
    margin-top: 2.2em;
    padding-bottom: .35em;
    border-bottom: 1px solid var(--border);
  }
  .viewer :global(h3) { font-size: 1.22em; margin-top: 1.7em; }
  .viewer :global(h4) { font-size: 1.05em; margin-top: 1.5em; }
  .viewer :global(h5) { font-size: 1em; margin-top: 1.3em; }
  .viewer :global(h6) {
    font-size: .82em;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .08em;
    font-weight: 600;
    margin-top: 1.5em;
  }

  /* ─── Paragraph & inline ───────────────────────────────── */
  .viewer :global(p) { margin: .85em 0; }
  .viewer :global(strong) { font-weight: 600; color: var(--fg-strong); }
  .viewer :global(em) { font-style: italic; }
  .viewer :global(del) { color: var(--muted); }
  .viewer :global(mark) {
    background: var(--highlight-bg);
    color: inherit;
    padding: 0 .15em;
    border-radius: 2px;
  }
  .viewer :global(sup),
  .viewer :global(sub) { font-size: .75em; line-height: 0; vertical-align: baseline; position: relative; }
  .viewer :global(sup) { top: -.5em; }
  .viewer :global(sub) { bottom: -.25em; }
  .viewer :global(kbd) {
    background: var(--muted-bg);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 0 .35em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Cascadia Mono", monospace;
    font-size: .85em;
    line-height: 1;
  }

  /* ─── Links ────────────────────────────────────────────── */
  .viewer :global(a) {
    color: var(--link);
    text-decoration: none;
    text-underline-offset: 2px;
  }
  .viewer :global(a:hover) { text-decoration: underline; }

  /* ─── Code ─────────────────────────────────────────────── */
  .viewer :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Cascadia Mono", monospace;
    background: var(--code-inline-bg);
    padding: .12em .4em;
    border-radius: 4px;
    font-size: .88em;
  }
  .viewer :global(pre) {
    background: var(--code-bg);
    padding: 1em 1.1em;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1.1em 0;
    font-size: .88em;
    line-height: 1.55;
    border: 1px solid var(--border);
  }
  .viewer :global(pre > code) {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: 1em;
    color: inherit;
  }

  /* ─── Blockquote ───────────────────────────────────────── */
  .viewer :global(blockquote) {
    border-left: 3px solid var(--border);
    margin: 1em 0;
    padding: .25em 1.1em;
    color: var(--muted);
    background: transparent;
  }
  .viewer :global(blockquote > :first-child) { margin-top: 0; }
  .viewer :global(blockquote > :last-child)  { margin-bottom: 0; }
  .viewer :global(blockquote p) { margin: .5em 0; }

  /* ─── GFM Alerts ───────────────────────────────────────── */
  .viewer :global(.markdown-alert) {
    border-left: 4px solid var(--alert-color, var(--accent));
    background: var(--alert-bg, transparent);
    margin: 1.2em 0;
    padding: .7em 1.2em;
    border-radius: 0 6px 6px 0;
    color: var(--fg);
  }
  .viewer :global(.markdown-alert > :first-child) { margin-top: 0; }
  .viewer :global(.markdown-alert > :last-child)  { margin-bottom: 0; }
  .viewer :global(.markdown-alert-title) {
    display: flex;
    align-items: center;
    gap: .4em;
    font-weight: 600;
    color: var(--alert-color);
    text-transform: uppercase;
    font-size: .8em;
    letter-spacing: .06em;
    margin-bottom: .4em;
  }
  .viewer :global(.markdown-alert-title::before) {
    content: "";
    display: inline-block;
    width: 1em; height: 1em;
    background-color: currentColor;
    -webkit-mask: var(--alert-icon) center / contain no-repeat;
            mask: var(--alert-icon) center / contain no-repeat;
  }
  .viewer :global(.markdown-alert-note) {
    --alert-color: #4493f8;
    --alert-bg: rgba(56, 139, 253, 0.08);
    --alert-icon: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="black" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75M8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/></svg>');
  }
  .viewer :global(.markdown-alert-tip) {
    --alert-color: #3fb950;
    --alert-bg: rgba(46, 160, 67, 0.08);
    --alert-icon: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="black" d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75M5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5M6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75"/></svg>');
  }
  .viewer :global(.markdown-alert-important) {
    --alert-color: #ab7df8;
    --alert-bg: rgba(137, 87, 229, 0.08);
    --alert-icon: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="black" d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.189l2.72-2.719a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0M9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/></svg>');
  }
  .viewer :global(.markdown-alert-warning) {
    --alert-color: #d29922;
    --alert-bg: rgba(187, 128, 9, 0.08);
    --alert-icon: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="black" d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0M9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/></svg>');
  }
  .viewer :global(.markdown-alert-caution) {
    --alert-color: #f85149;
    --alert-bg: rgba(229, 83, 75, 0.08);
    --alert-icon: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="black" d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4m0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/></svg>');
  }

  /* ─── Lists ────────────────────────────────────────────── */
  .viewer :global(ul),
  .viewer :global(ol) {
    padding-left: 1.7em;
    margin: .65em 0;
  }
  .viewer :global(li) {
    margin: .2em 0;
  }
  .viewer :global(li > p) {
    margin: .35em 0;
  }
  .viewer :global(li > p:first-child) { margin-top: 0; }
  .viewer :global(li > p:last-child)  { margin-bottom: 0; }
  .viewer :global(ul ul),
  .viewer :global(ul ol),
  .viewer :global(ol ul),
  .viewer :global(ol ol) {
    margin: .15em 0;
  }
  .viewer :global(ul) { list-style: disc; }
  .viewer :global(ul ul) { list-style: circle; }
  .viewer :global(ul ul ul) { list-style: square; }

  /* Task list items (comrak emits <input type="checkbox" disabled>) */
  .viewer :global(li:has(> input[type="checkbox"])),
  .viewer :global(li.task-list-item) {
    list-style: none;
    margin-left: -1.4em;
  }
  .viewer :global(li > input[type="checkbox"]) {
    margin: 0 .55em 0 0;
    transform: translateY(.05em);
    accent-color: var(--accent);
    width: 1em;
    height: 1em;
    cursor: default;
  }

  /* ─── Tables ───────────────────────────────────────────── */
  .viewer :global(table) {
    border-collapse: collapse;
    margin: 1.2em 0;
    width: 100%;
    font-size: .94em;
    overflow-x: auto;
    display: block;
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  /* On wide enough viewports, render as table for better column behaviour */
  @media (min-width: 600px) {
    .viewer :global(table) { display: table; }
  }
  .viewer :global(thead) { background: var(--muted-bg); }
  .viewer :global(th),
  .viewer :global(td) {
    border: 1px solid var(--border);
    padding: .5em .8em;
    text-align: left;
    vertical-align: top;
  }
  .viewer :global(th) { font-weight: 600; }
  .viewer :global(tbody tr:nth-child(even)) { background: var(--zebra-bg); }

  /* ─── Images ───────────────────────────────────────────── */
  .viewer :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    display: block;
    margin: 1em auto;
  }
  .viewer :global(p > img) { display: inline-block; margin: 0; }

  /* ─── Horizontal rule ──────────────────────────────────── */
  .viewer :global(hr) {
    border: 0;
    height: 1px;
    background: var(--border);
    margin: 2.2em 0;
    width: 100%;
  }

  /* ─── Footnotes ────────────────────────────────────────── */
  .viewer :global(.footnotes) {
    margin-top: 3em;
    padding-top: 1em;
    border-top: 1px solid var(--border);
    font-size: .9em;
    color: var(--muted);
  }
  .viewer :global(.footnotes ol) { padding-left: 1.4em; }
  .viewer :global(.footnotes li) { margin: .35em 0; }
  .viewer :global(sup.footnote-ref a),
  .viewer :global(.footnote-backref) {
    text-decoration: none;
    font-size: .85em;
  }
  .viewer :global(.footnote-backref) { margin-left: .3em; }

  /* ─── Definition lists ─────────────────────────────────── */
  .viewer :global(dl) { margin: 1em 0; }
  .viewer :global(dt) { font-weight: 600; margin-top: .6em; }
  .viewer :global(dd) { margin-left: 1.6em; margin-top: .15em; color: var(--muted); }

  /* ─── Math (KaTeX) ─────────────────────────────────────── */
  .viewer :global(.katex) { font-size: 1.05em; }
  .viewer :global(.katex-display) {
    margin: 1em 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: .25em 0;
  }

  /* ─── Mermaid ──────────────────────────────────────────── */
  .viewer :global(.mermaid-rendered) {
    display: flex;
    justify-content: center;
    margin: 1.4em 0;
  }
  .viewer :global(.mermaid-rendered svg) { max-width: 100%; height: auto; }
  .viewer :global(.mermaid-error) {
    color: #c00;
    font-family: ui-monospace, monospace;
    padding: .5em .8em;
    background: rgba(200, 0, 0, 0.08);
    border-left: 3px solid #c00;
    border-radius: 0 4px 4px 0;
  }
</style>
