<script lang="ts">
  /**
   * Page preview — "what will this look like once it is a Word document?"
   *
   * The workflow this exists for: knowledge work is drafted here as markdown
   * (often with an AI writing into the file), and then has to go to a team as
   * a Word document in the house format. Before exporting, the only question
   * that matters is *how long is it and where do the pages break* — and
   * answering that used to mean actually converting the file, opening Word,
   * and looking. This is that answer without the round trip.
   *
   * It is a **preview, not a converter.** Nothing is written to disk and no
   * .docx is produced; the markdown is laid out under Word's page geometry so
   * the page count and the breaks are real.
   *
   * ── The format it emulates ────────────────────────────────────────────
   * US Letter, Word's "Normal" margins (1in all round), body text at 11pt
   * Calibri Light, Word's default paragraph spacing (8pt after, 1.08 line
   * multiple), and continuous line numbers down the left margin. Headings get
   * a rule across the full text column — which in Word is a *paragraph bottom
   * border*, not a character underline; that is why it runs the width of the
   * column rather than stopping at the end of the words.
   *
   * ── How pagination actually works here ────────────────────────────────
   * The content is laid out once, off-screen, at exactly the text-column width
   * (6.5in). Every visual line's box is then measured with `Range.getClientRects`
   * — one rect per line box, which is what makes wrapped paragraphs, tables
   * and headings all countable without guessing at line heights. Page breaks
   * are placed at the last **line boundary** that fits inside 9in of content,
   * so a line is never sliced in half across a break, exactly as Word behaves.
   * Each page then renders a clipped window onto that same content, offset to
   * its slice.
   *
   * The line measurement does double duty: the numbers in the margin come from
   * the same array as the break positions, so they cannot disagree.
   *
   * v0.9.0+.
   */
  import { onMount } from "svelte";
  import { api } from "./api";
  import { postRender } from "./post-render";
  import Icon from "./Icon.svelte";

  interface Props {
    source: string;
    basePath: string;
    onExit: () => void;
  }
  let { source, basePath, onExit }: Props = $props();

  // ── Page geometry, in CSS px at 96dpi (1in = 96px) ──────────────────
  const PAGE_W = 816;        // 8.5in
  const PAGE_H = 1056;       // 11in
  const MARGIN = 96;         // 1in — Word's "Normal"
  const CONTENT_W = PAGE_W - MARGIN * 2;  // 6.5in
  const CONTENT_H = PAGE_H - MARGIN * 2;  // 9in

  const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.25, 1.5];
  /** Leftover content shorter than this can't hold a line, so it is not a page. */
  const MIN_TAIL = 12;

  let zoom = $state(0.8);
  let html = $state("");
  let measureEl = $state<HTMLElement | null>(null);
  let pagesEl = $state<HTMLElement | null>(null);
  /** One entry per visual line: vertical midpoint and bottom, in content px. */
  let lines = $state<Array<{ mid: number; bottom: number }>>([]);
  /** Start offset (content px) of each page. */
  let pageStarts = $state<number[]>([0]);
  let contentHeight = $state(0);
  let measuring = $state(true);

  let pageCount = $derived(pageStarts.length);

  /** Slice height for page `i` — where the next page starts, or the end. */
  function sliceEnd(i: number): number {
    return i + 1 < pageStarts.length ? pageStarts[i + 1] : contentHeight;
  }

  /** Line numbers that fall on page `i`, with their offset inside the page. */
  function pageLines(i: number): Array<{ n: number; y: number }> {
    const start = pageStarts[i];
    const end = sliceEnd(i);
    const out: Array<{ n: number; y: number }> = [];
    for (let n = 0; n < lines.length; n++) {
      const mid = lines[n].mid;
      if (mid >= start && mid < end) out.push({ n: n + 1, y: mid - start });
    }
    return out;
  }

  // ── Render ──────────────────────────────────────────────────────────
  // Always the light palette: this is a preview of a printed page, and a
  // dark-mode "Word document" is not a thing anyone is trying to look at.
  $effect(() => {
    const src = source;
    let cancelled = false;
    (async () => {
      measuring = true;
      const rendered = await api.renderMarkdown(src, "light");
      if (cancelled) return;
      html = rendered;
      // Let Svelte paint the measure column before touching it.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (cancelled || !measureEl) return;
      await postRender(measureEl, { dark: false });
      rewriteRelativeImages(measureEl, basePath);
      await settle(measureEl);
      if (cancelled) return;
      measure();
      measuring = false;
    })();
    return () => { cancelled = true; };
  });

  /** Images and webfonts both change line positions after first paint, and a
   *  measurement taken before they land is silently wrong — the page count
   *  would be right for a document nobody sees. */
  async function settle(root: HTMLElement) {
    try { await (document as any).fonts?.ready; } catch { /* older engines */ }
    const imgs = Array.from(root.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((res) => {
              img.addEventListener("load", () => res(), { once: true });
              img.addEventListener("error", () => res(), { once: true });
            }),
      ),
    );
  }

  /** Relative image paths are resolved against the document, same as the
   *  Viewer does — a preview with broken images misreports its own length. */
  function rewriteRelativeImages(root: HTMLElement, docPath: string) {
    if (!docPath) return;
    const dir = docPath.replace(/[\\/][^\\/]*$/, "");
    for (const img of Array.from(root.querySelectorAll("img"))) {
      const src = img.getAttribute("src") ?? "";
      if (!src || /^(https?:|data:|asset:|file:)/i.test(src)) continue;
      img.setAttribute("data-rel-src", src);
      // Left as-is when the app isn't running under Tauri; the Viewer owns the
      // real conversion and this preview only needs the height to be right.
      const abs = `${dir}/${src}`.replace(/\\/g, "/");
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const conv = (window as any).__TAURI_INTERNALS__?.convertFileSrc;
        if (conv) img.setAttribute("src", conv(abs));
      } catch { /* preview still lays out with the broken image box */ }
    }
  }

  /**
   * One rect per visual line, merged across inline runs.
   *
   * `Range.getClientRects()` over a text node returns a rect per line box, so
   * a wrapped paragraph yields one rect per wrapped line — which is precisely
   * the unit Word numbers. Rects that overlap vertically belong to the same
   * line (a bold run, an inline code span, a table row's cells) and are merged.
   */
  function measure() {
    const root = measureEl;
    if (!root) return;
    const base = root.getBoundingClientRect().top;
    const rects: Array<{ top: number; bottom: number }> = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        if (r.height <= 0 || r.width <= 0) continue;
        rects.push({ top: r.top - base, bottom: r.bottom - base });
      }
    }
    // Images and other replaced blocks carry no text, but they take vertical
    // space and Word numbers the line they sit on.
    for (const el of Array.from(root.querySelectorAll("img, hr, .mermaid-rendered"))) {
      const r = el.getBoundingClientRect();
      if (r.height <= 0) continue;
      rects.push({ top: r.top - base, bottom: r.bottom - base });
    }

    rects.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
    const merged: Array<{ mid: number; bottom: number }> = [];
    let top = -1;
    let bottom = -1;
    const flush = () => {
      if (bottom >= 0) merged.push({ mid: (top + bottom) / 2, bottom });
    };
    for (const r of rects) {
      // Overlapping vertically ⇒ same line. The 2px slack absorbs sub-pixel
      // differences between a text rect and an inline-block on the same line.
      if (bottom >= 0 && r.top < bottom - 2) {
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      } else {
        flush();
        top = r.top;
        bottom = r.bottom;
      }
    }
    flush();

    lines = merged;
    contentHeight = root.scrollHeight;

    // Break at the last line that fits inside a page of content. A block
    // taller than a whole page (a large image, a long table) can't be broken
    // on a line boundary, so it falls back to a hard cut — the alternative is
    // an infinite loop of empty pages.
    const starts = [0];
    let cursor = 0;
    let guard = 0;
    while (contentHeight - cursor > MIN_TAIL && guard++ < 500) {
      const limit = cursor + CONTENT_H;
      let next = 0;
      for (const l of merged) {
        if (l.bottom > cursor && l.bottom <= limit) next = l.bottom;
      }
      if (next <= cursor) next = limit;
      // MIN_TAIL, not `>= contentHeight`: `scrollHeight` is rounded up to a
      // whole pixel while the last line's bottom is fractional, so an exact
      // comparison left a 1.5px sliver behind and reported one page too many.
      if (contentHeight - next <= MIN_TAIL) break;
      starts.push(next);
      cursor = next;
    }
    pageStarts = starts;
  }

  function bumpZoom(dir: 1 | -1) {
    const i = ZOOM_STEPS.indexOf(zoom);
    const next = i === -1 ? 3 : Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir));
    zoom = ZOOM_STEPS[next];
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onExit(); }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); bumpZoom(1); }
    if (mod && e.key === "-") { e.preventDefault(); bumpZoom(-1); }
  }

  onMount(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Rough word count — the other number people ask for before exporting. */
  let wordCount = $derived(
    source.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length,
  );
</script>

<div class="wp">
  <div class="wp-bar">
    <span class="wp-title">
      <Icon name="file-page" size={14} />
      Page preview
    </span>
    <span class="wp-meta">
      {#if measuring}
        measuring…
      {:else}
        {pageCount} {pageCount === 1 ? "page" : "pages"}
        <span class="dot">·</span>
        {lines.length} lines
        <span class="dot">·</span>
        {wordCount.toLocaleString()} words
      {/if}
    </span>
    <span class="wp-spacer"></span>
    <span class="wp-format" title="US Letter · Normal margins (1in) · Calibri Light 11pt · continuous line numbers">
      Letter · Calibri Light 11
    </span>
    <div class="wp-zoom">
      <button onclick={() => bumpZoom(-1)} aria-label="Zoom out" title="Zoom out"><Icon name="minus" size={12} /></button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onclick={() => bumpZoom(1)} aria-label="Zoom in" title="Zoom in"><Icon name="plus" size={12} /></button>
    </div>
    <button class="wp-close" onclick={onExit} title="Back to the document (Esc)">
      <Icon name="x" size={14} />
      <span>Close</span>
    </button>
  </div>

  <div class="wp-canvas">
    <div class="wp-pages" style="zoom: {zoom}" bind:this={pagesEl}>
      {#each pageStarts as start, i (i)}
        <div class="wp-page">
          <div class="wp-gutter" aria-hidden="true">
            {#each pageLines(i) as l (l.n)}
              <span class="wp-lineno" style="top: {l.y}px">{l.n}</span>
            {/each}
          </div>
          <div class="wp-window" style="height: {sliceEnd(i) - start}px">
            <div class="wp-content" style="transform: translateY({-start}px)">{@html html}</div>
          </div>
          <div class="wp-folio">{i + 1}</div>
        </div>
      {/each}
    </div>
  </div>

  <!-- The measuring column: same width and same styles as a page's text
       column, laid out off-screen. `visibility: hidden` rather than
       `display: none` — a display:none subtree has no boxes, so every rect
       would come back zero. -->
  <div class="wp-measure" aria-hidden="true">
    <div class="wp-content" bind:this={measureEl}>{@html html}</div>
  </div>
</div>

<style>
  .wp {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    background: var(--chrome-sunken);
  }

  /* ─── Toolbar ─────────────────────────────────────────────────────── */
  .wp-bar {
    display: flex;
    align-items: center;
    gap: .6rem;
    padding: 0 .7rem;
    height: 34px;
    flex-shrink: 0;
    background: var(--side-bg);
    border-bottom: 1px solid var(--border);
    font-size: 11.5px;
    color: var(--muted-strong);
  }
  .wp-title {
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    font-weight: 600;
    color: var(--fg-strong);
  }
  .wp-meta { font-variant-numeric: tabular-nums; }
  .wp-meta .dot { opacity: .4; margin: 0 .15rem; }
  .wp-spacer { flex: 1 1 auto; }
  .wp-format { opacity: .75; }
  .wp-zoom {
    display: inline-flex;
    align-items: center;
    gap: .1rem;
    background: var(--chrome-sunken);
    border-radius: 6px;
    padding: 2px;
  }
  .wp-zoom span {
    min-width: 3.1em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .wp-bar button {
    display: inline-flex;
    align-items: center;
    gap: .3rem;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
    padding: .2rem .4rem;
    border-radius: 5px;
    line-height: 1.4;
  }
  .wp-bar button:hover { background: var(--hover-bg); color: var(--fg-strong); }

  /* ─── The desk ────────────────────────────────────────────────────── */
  .wp-canvas {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 24px 0 48px;
  }
  .wp-pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .wp-page {
    position: relative;
    width: 816px;              /* 8.5in */
    min-height: 1056px;        /* 11in */
    padding: 96px;             /* Word's "Normal" margins */
    background: #ffffff;
    color: #000000;
    box-shadow: 0 1px 3px rgba(0, 0, 0, .18), 0 8px 24px rgba(0, 0, 0, .10);
    /* Offscreen pages skip layout entirely — a 40-page document would
       otherwise pay for 40 copies of the content on every scroll. */
    content-visibility: auto;
    contain-intrinsic-size: 816px 1056px;
  }
  /* The clipped window onto the shared content column. */
  .wp-window { overflow: hidden; position: relative; }

  .wp-gutter {
    position: absolute;
    left: 52px;
    top: 96px;
    width: 26px;
    height: calc(100% - 192px);
  }
  .wp-lineno {
    position: absolute;
    right: 0;
    transform: translateY(-50%);
    font-family: "Calibri Light", Calibri, Carlito, "Segoe UI", sans-serif;
    font-size: 9pt;
    color: #9a9a9a;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .wp-folio {
    position: absolute;
    right: 12px;
    bottom: 10px;
    font-size: 9px;
    color: #b4b4b4;
    font-variant-numeric: tabular-nums;
  }

  .wp-measure {
    position: absolute;
    left: -10000px;
    top: 0;
    width: 624px;
    visibility: hidden;
    pointer-events: none;
  }

  /* ─── Word-ish document styles ───────────────────────────────────────
     Deliberately hard-coded rather than themed: this is a preview of a page
     that will be printed or mailed, so it is black on white regardless of the
     app's theme. Everything below is in pt to keep the arithmetic honest
     against Word's own units. */
  .wp-content {
    width: 624px;              /* 6.5in text column */
    font-family: "Calibri Light", Calibri, Carlito, "Segoe UI", sans-serif;
    font-size: 11pt;
    /* Word's default: 1.08 multiple on single spacing. */
    line-height: 1.37;
    color: #000;
    text-align: left;
  }
  .wp-content :global(p) { margin: 0 0 8pt; }
  .wp-content :global(h1),
  .wp-content :global(h2),
  .wp-content :global(h3),
  .wp-content :global(h4),
  .wp-content :global(h5),
  .wp-content :global(h6) {
    font-family: "Calibri Light", Calibri, Carlito, "Segoe UI", sans-serif;
    font-weight: 700;
    color: #000;
    margin: 12pt 0 6pt;
    line-height: 1.25;
  }
  .wp-content :global(h1:first-child),
  .wp-content :global(h2:first-child) { margin-top: 0; }
  .wp-content :global(h1) { font-size: 16pt; }
  .wp-content :global(h2) { font-size: 13pt; }
  .wp-content :global(h3) { font-size: 12pt; }
  .wp-content :global(h4),
  .wp-content :global(h5),
  .wp-content :global(h6) { font-size: 11pt; }
  /* The rule that runs the full width of the column. In Word this is a
     paragraph *bottom border*, which is why it doesn't stop where the words
     do — a character underline would. */
  .wp-content :global(h1),
  .wp-content :global(h2) {
    border-bottom: 1px solid #000;
    padding-bottom: 3pt;
  }
  .wp-content :global(ul),
  .wp-content :global(ol) { margin: 0 0 8pt; padding-left: 24pt; }
  .wp-content :global(li) { margin: 0 0 2pt; }
  .wp-content :global(blockquote) {
    margin: 0 0 8pt 18pt;
    padding-left: 9pt;
    border-left: 3px solid #d0d0d0;
    color: #333;
  }
  .wp-content :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0 0 8pt;
    font-size: 10pt;
  }
  .wp-content :global(th),
  .wp-content :global(td) {
    border: 1px solid #808080;
    padding: 3pt 5pt;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .wp-content :global(th) { font-weight: 700; background: #f2f2f2; }
  .wp-content :global(img) { max-width: 100%; height: auto; }
  .wp-content :global(code) {
    font-family: Consolas, "Courier New", monospace;
    font-size: 10pt;
  }
  .wp-content :global(pre) {
    background: #f5f5f5;
    border: 1px solid #dcdcdc;
    padding: 6pt 8pt;
    margin: 0 0 8pt;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 9.5pt;
    line-height: 1.3;
  }
  .wp-content :global(hr) { border: 0; border-top: 1px solid #bfbfbf; margin: 10pt 0; }
  .wp-content :global(a) { color: #0563c1; text-decoration: underline; }
  /* App furniture that has no business on a printed page. */
  .wp-content :global(.code-copy) { display: none; }
  .wp-content :global(.table-scroll) { overflow: visible; border: 0; border-radius: 0; margin: 0; }
</style>
