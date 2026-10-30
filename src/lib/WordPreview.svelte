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
   * `docx/format.ts` is the single source: A4, a margin preset, a body size
   * the user picks (10pt by default) from which every other size derives.
   * The `#` title sits in the page header with a rule under it, so the `##`
   * sections are the first tier, numbered "1.", "2."; `###` are "3.1", "3.2".
   * Lists indent 0.25in per level, block quotes are small grey notes, tables
   * are small with a black header and reach 0.3in into the left margin, where
   * the line numbers end. Every CSS value below is derived from the same
   * `Format` the exporter uses; if one changes shape, change both.
   *
   * ── How pagination actually works here ────────────────────────────────
   * The content is laid out once, off-screen, at exactly the text-column
   * width. Every visual line's box is then measured with `Range.getClientRects`
   * — one rect per line box, which is what makes wrapped paragraphs, tables
   * and headings all countable without guessing at line heights. Page breaks
   * are placed at the last **line boundary** that fits inside the page's
   * content height, never inside a table row or between a figure and its
   * caption, so nothing is sliced across a break, as Word behaves. Each page
   * then renders a clipped window onto that same content, offset to its slice.
   *
   * The line measurement does double duty: the numbers in the margin come from
   * the same array as the break positions, so they cannot disagree.
   *
   * v0.9.0+. Reworked for the house format in v0.13.0-nightly.2 and 3.
   */
  import { onMount } from "svelte";
  import { api } from "./api";
  import { postRender } from "./post-render";
  import Icon from "./Icon.svelte";
  import {
    BODY_PT_MAX,
    BODY_PT_MIN,
    MARGINS,
    PAGE_H_TWIPS,
    PAGE_W_TWIPS,
    prepareHeadings,
    resolveFormat,
    type MarginPreset,
  } from "./docx/format";

  interface Props {
    source: string;
    basePath: string;
    onExit: () => void;
    /** Write this document as a .docx. The preview is where the question
     *  "does this look right?" is answered, so it is where the answer
     *  "then send it" belongs. */
    onExport?: () => void;
    /** Live status of an export started from here. */
    exporting?: boolean;
    /** Left-hand footer text, from Settings → Word export. */
    footer?: string;
    /** Body size and margin preset, from Settings → Word export. The bar
     *  below can change them; the callbacks persist the change so the export
     *  uses the same values. */
    bodyPt?: number;
    margins?: MarginPreset;
    onBodyPt?: (pt: number) => void;
    onMargins?: (m: MarginPreset) => void;
  }
  let {
    source, basePath, onExit, onExport, exporting = false, footer = "",
    bodyPt = 10, margins = "house", onBodyPt, onMargins,
  }: Props = $props();

  // ── Page geometry, in CSS px at 96dpi (1in = 96px) ──────────────────
  const PX_PER_IN = 96;
  const PAGE_W = Math.round((PAGE_W_TWIPS / 1440) * PX_PER_IN); // 794
  const PAGE_H = Math.round((PAGE_H_TWIPS / 1440) * PX_PER_IN); // 1123

  let fmt = $derived(resolveFormat({ bodyPt, margins, footer }));
  let MARGIN_X = $derived(Math.round(fmt.marginSideIn * PX_PER_IN));
  let MARGIN_Y = $derived(Math.round(fmt.marginTopIn * PX_PER_IN));
  let CONTENT_W = $derived(PAGE_W - MARGIN_X * 2);
  let CONTENT_H = $derived(PAGE_H - MARGIN_Y * 2);
  let OUTDENT = $derived(Math.round(fmt.tableOutdentIn * PX_PER_IN)); // 29
  /** Header: the title line sits 0.35in from the top edge, as in the export. */
  const HEADER_TOP = Math.round(0.35 * PX_PER_IN);

  /** CSS custom properties that carry the format into the document styles. */
  let docVars = $derived(
    `--body: ${fmt.bodyPt}pt; --title: ${fmt.titlePt}pt; --small: ${fmt.smallPt}pt; ` +
    `--footer: ${fmt.footerPt}pt; --step: ${fmt.listStepIn}in; --outdent: ${fmt.tableOutdentIn}in;`,
  );

  /** Leftover content shorter than this can't hold a line, so it is not a page. */
  const MIN_TAIL = 12;
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2.0;
  const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.25, 1.5];

  let zoom = $state(0.8);
  let html = $state("");
  let title = $state("");
  let measureEl = $state<HTMLElement | null>(null);
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
  // Re-runs when the source OR the format changes (a size or margin change
  // moves every page break).
  $effect(() => {
    const src = source;
    void fmt; // dependency: re-measure on a format change
    let cancelled = false;
    (async () => {
      measuring = true;
      const rendered = await api.renderMarkdown(src, "light");
      if (cancelled) return;
      const prepared = prepare(rendered);
      title = prepared.title;
      html = prepared.html;
      // Let Svelte paint the measure column before touching it.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (cancelled || !measureEl) return;
      await postRender(measureEl, { dark: false });
      await rewriteRelativeImages(measureEl, basePath);
      await settle(measureEl);
      if (cancelled) return;
      measure();
      measuring = false;
    })();
    return () => { cancelled = true; };
  });

  /**
   * The same preparation the exporter does, so the two agree: the `#` title
   * leaves the body (it goes in the page header), `##`/`###` get their numbers,
   * and a paragraph that is only an image becomes a captioned figure.
   */
  function prepare(rendered: string): { html: string; title: string } {
    const doc = new DOMParser().parseFromString(`<body>${rendered}</body>`, "text/html");
    const { title } = prepareHeadings(doc.body);
    let n = 0;
    for (const p of Array.from(doc.body.querySelectorAll("p"))) {
      const kids = Array.from(p.childNodes).filter(
        (c) => !(c.nodeType === Node.TEXT_NODE && !(c.textContent ?? "").trim()),
      );
      if (kids.length !== 1 || (kids[0] as HTMLElement).tagName !== "IMG") continue;
      p.classList.add("wp-figure");
      const alt = ((kids[0] as HTMLImageElement).getAttribute("alt") ?? "").trim();
      if (!alt) continue;
      n += 1;
      const cap = doc.createElement("p");
      cap.className = "wp-caption";
      cap.textContent = `Figure ${n}: ${alt}`;
      p.after(cap);
    }
    return { html: doc.body.innerHTML, title };
  }

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
              // A src that never answers must not hold the page count hostage.
              setTimeout(res, 4000);
            }),
      ),
    );
  }

  /** `dir/./a/../b.png` → `dir/b.png`. Same as the Viewer's. */
  function resolveRelative(dir: string, rel: string): string {
    const parts: string[] = [];
    for (const seg of `${dir}/${rel}`.split(/[\\/]+/)) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return parts.join("/");
  }

  /** Relative image paths are resolved against the document, the same way
   *  the Viewer does it (through `convertFileSrc` from the API, which is the
   *  supported route; poking `__TAURI_INTERNALS__` directly is what left the
   *  figure as an empty box in v0.13.0-nightly.2). A preview with broken
   *  images misreports its own length. */
  async function rewriteRelativeImages(root: HTMLElement, docPath: string) {
    if (!docPath) return;
    const dir = docPath.replace(/[\\/][^\\/]*$/, "");
    const imgs = Array.from(root.querySelectorAll("img"));
    if (imgs.length === 0) return;
    let convert: ((p: string) => string) | null = null;
    try {
      const core = await import("@tauri-apps/api/core");
      convert = core.convertFileSrc;
    } catch { /* plain browser (vite dev): leave paths as they are */ }
    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      if (!src || /^(https?:|data:|asset:|file:)/i.test(src)) continue;
      const abs = /^([a-zA-Z]:[\\/]|\/)/.test(src) ? src : resolveRelative(dir, src);
      if (convert) {
        try { img.src = convert(abs); } catch { /* keep the broken box */ }
      }
    }
  }

  /**
   * One rect per visual line, merged across inline runs.
   *
   * `Range.getClientRects()` over a text node returns a rect per line box, so
   * a wrapped paragraph yields one rect per wrapped line — which is precisely
   * the unit Word numbers. Rects that overlap vertically belong to the same
   * line (a bold run, an inline code span, a table row's cells) and are merged.
   *
   * Besides the lines, the walk records **atomic ranges**: a table row, and a
   * figure with its caption. A page break may not fall inside one — a row cut
   * in half across two pages was the first thing noticed in the nightly.
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

    // Atomic ranges: table rows, and figure + caption pairs.
    const atomic: Array<{ top: number; bottom: number }> = [];
    for (const tr of Array.from(root.querySelectorAll("tr"))) {
      const r = tr.getBoundingClientRect();
      if (r.height > 0) atomic.push({ top: r.top - base, bottom: r.bottom - base });
    }
    for (const fig of Array.from(root.querySelectorAll("p.wp-figure"))) {
      const r = fig.getBoundingClientRect();
      const cap = fig.nextElementSibling;
      const end = cap && cap.classList.contains("wp-caption") ? cap.getBoundingClientRect().bottom : r.bottom;
      if (r.height > 0) atomic.push({ top: r.top - base, bottom: end - base });
    }
    const insideAtomic = (y: number) => atomic.some((a) => y > a.top + 1 && y < a.bottom - 1);

    lines = merged;
    contentHeight = root.scrollHeight;

    // Break at the last line that fits inside a page of content and is not
    // inside an atomic range. A block taller than a whole page (a large
    // image, a very long row) can't be broken on a line boundary, so it
    // falls back to a hard cut — the alternative is an infinite loop of
    // empty pages.
    const starts = [0];
    let cursor = 0;
    let guard = 0;
    const pageH = CONTENT_H;
    while (contentHeight - cursor > MIN_TAIL && guard++ < 500) {
      const limit = cursor + pageH;
      let next = 0;
      for (const l of merged) {
        if (l.bottom > cursor && l.bottom <= limit && !insideAtomic(l.bottom)) next = l.bottom;
      }
      // Also allow a break exactly at an atomic block's bottom edge, which
      // may sit a few px below its last text line (cell padding, borders).
      for (const a of atomic) {
        if (a.bottom > cursor && a.bottom <= limit && a.bottom > next) next = a.bottom;
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

  // ── Zoom ────────────────────────────────────────────────────────────
  // Buttons step through the fixed stops. A pinch or Ctrl+wheel is continuous:
  // the zoom follows the fingers, with the CSS transition below smoothing the
  // frames in between. WebKit (the engine on macOS) reports a trackpad pinch
  // as `gesturechange` with a cumulative `scale`; Chromium and Windows report
  // it as a wheel event with ctrlKey. Both are handled.
  function clampZoom(z: number) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
  }

  function bumpZoom(dir: 1 | -1) {
    const next = dir > 0
      ? ZOOM_STEPS.find((s) => s > zoom + 0.001) ?? ZOOM_MAX
      : [...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.001) ?? ZOOM_MIN;
    zoom = clampZoom(next);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onExit(); }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); bumpZoom(1); }
    if (mod && e.key === "-") { e.preventDefault(); bumpZoom(-1); }
    if (mod && e.key === "0") { e.preventDefault(); zoom = 1; }
  }

  function onCanvasWheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    // Exponential, so a given finger travel feels the same at 50% and 150%.
    zoom = clampZoom(zoom * Math.exp(-e.deltaY * unit * 0.0025));
  }

  let gestureBase = 1;
  function onGestureStart(e: Event) { e.preventDefault(); gestureBase = zoom; }
  function onGestureChange(e: Event) {
    e.preventDefault();
    const scale = (e as any).scale as number | undefined;
    if (typeof scale === "number" && scale > 0) zoom = clampZoom(gestureBase * scale);
  }

  onMount(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Non-passive so the browser's own Ctrl+wheel page zoom can be suppressed. */
  function wheelZoom(node: HTMLElement) {
    node.addEventListener("wheel", onCanvasWheel, { passive: false });
    node.addEventListener("gesturestart", onGestureStart, { passive: false });
    node.addEventListener("gesturechange", onGestureChange, { passive: false });
    return {
      destroy: () => {
        node.removeEventListener("wheel", onCanvasWheel);
        node.removeEventListener("gesturestart", onGestureStart);
        node.removeEventListener("gesturechange", onGestureChange);
      },
    };
  }

  // ── Format controls ─────────────────────────────────────────────────
  const MARGIN_ORDER: MarginPreset[] = ["narrow", "house", "wide"];
  function bumpBody(d: 1 | -1) {
    const next = Math.min(BODY_PT_MAX, Math.max(BODY_PT_MIN, bodyPt + d));
    if (next !== bodyPt) onBodyPt?.(next);
  }
  function cycleMargins() {
    const i = MARGIN_ORDER.indexOf(margins);
    onMargins?.(MARGIN_ORDER[(i + 1) % MARGIN_ORDER.length]);
  }
  let marginLabel = $derived(
    `${margins[0].toUpperCase()}${margins.slice(1)} · ${MARGINS[margins].side}in`,
  );

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

    <!-- The two format knobs. They write to Settings, so the export uses the
         same values the preview showed. -->
    <div class="wp-knob" title="Body text size. Title, tables and notes follow it.">
      <button onclick={() => bumpBody(-1)} aria-label="Smaller text" disabled={bodyPt <= BODY_PT_MIN}><Icon name="minus" size={12} /></button>
      <span>{bodyPt} pt</span>
      <button onclick={() => bumpBody(1)} aria-label="Larger text" disabled={bodyPt >= BODY_PT_MAX}><Icon name="plus" size={12} /></button>
    </div>
    <button class="wp-knob wp-margins" onclick={cycleMargins} title="Margins: narrow (0.5in), house (0.7in), wide (1in). Click to cycle.">
      <span>{marginLabel}</span>
    </button>
    <span class="wp-format" title="A4 · Calibri Light · line numbers · title in the header">A4</span>

    <div class="wp-zoom">
      <button onclick={() => bumpZoom(-1)} aria-label="Zoom out" title="Zoom out (⌘−, or pinch)"><Icon name="minus" size={12} /></button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onclick={() => bumpZoom(1)} aria-label="Zoom in" title="Zoom in (⌘+, or pinch)"><Icon name="plus" size={12} /></button>
    </div>
    {#if onExport}
      <button class="wp-export" onclick={onExport} disabled={exporting} title="Save this as a Word document (.docx)">
        <Icon name={exporting ? "refresh" : "download"} size={13} />
        <span>{exporting ? "Exporting…" : "Export .docx"}</span>
      </button>
    {/if}
    <button class="wp-close" onclick={onExit} title="Back to the document (Esc)">
      <Icon name="x" size={14} />
      <span>Close</span>
    </button>
  </div>

  <div class="wp-canvas" use:wheelZoom>
    <div class="wp-pages" style="zoom: {zoom}">
      {#each pageStarts as start, i (i)}
        <div class="wp-page" style="width: {PAGE_W}px; min-height: {PAGE_H}px; padding: {MARGIN_Y}px {MARGIN_X}px; {docVars}">
          {#if title}
            <div class="wp-header" style="top: {HEADER_TOP}px; left: {MARGIN_X}px; right: {MARGIN_X}px">{title}</div>
          {/if}
          <!-- The gutter's right edge is `outdent` left of the text, where a
               table's left edge lands — the same distance the export gives
               `lnNumType`. -->
          <div class="wp-gutter" aria-hidden="true" style="top: {MARGIN_Y}px; height: {CONTENT_H}px; left: {MARGIN_X - OUTDENT - 30}px">
            {#each pageLines(i) as l (l.n)}
              <span class="wp-lineno" style="top: {l.y}px">{l.n}</span>
            {/each}
          </div>
          <!-- The window is widened to the left by the table outdent and clips
               only vertically, so an outdented table is not cut at the text
               edge (the second bug from the nightly). -->
          <div class="wp-window" style="height: {sliceEnd(i) - start}px; margin-left: {-OUTDENT}px; padding-left: {OUTDENT}px; width: {CONTENT_W + OUTDENT}px">
            <div class="wp-content" style="width: {CONTENT_W}px; transform: translateY({-start}px)">{@html html}</div>
          </div>
          <div class="wp-footer" style="left: {MARGIN_X}px; right: {MARGIN_X}px">
            <span>{footer}</span>
            <span>Page {i + 1} of {pageCount}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- The measuring column: same width and same styles as a page's text
       column, laid out off-screen. `visibility: hidden` rather than
       `display: none` — a display:none subtree has no boxes, so every rect
       would come back zero. -->
  <div class="wp-measure" aria-hidden="true" style="width: {CONTENT_W}px; {docVars}">
    <div class="wp-content" style="width: {CONTENT_W}px" bind:this={measureEl}>{@html html}</div>
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
  .wp-zoom, .wp-knob {
    display: inline-flex;
    align-items: center;
    gap: .1rem;
    background: var(--chrome-sunken);
    border-radius: 6px;
    padding: 2px;
  }
  .wp-zoom span, .wp-knob span {
    min-width: 3.1em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .wp-margins span { min-width: 0; padding: 0 .3rem; }
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
  .wp-bar button:disabled { opacity: .55; cursor: default; }
  .wp-bar button:disabled:hover { background: none; color: inherit; }
  .wp-bar button.wp-knob { padding: 2px; }
  .wp-bar button.wp-knob:hover { background: var(--hover-bg); }

  /* The one action in this bar that writes something. It is the whole point of
     having looked at the preview, so it carries weight the zoom controls don't. */
  .wp-export {
    font-weight: 600;
    color: var(--fg-strong) !important;
    background: var(--chrome-bg) !important;
    border: 1px solid var(--border) !important;
    padding: .22rem .55rem !important;
  }
  .wp-export:hover:not(:disabled) { background: var(--hover-bg) !important; }

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
    /* Smooth the zoom: a pinch arrives as many small steps, and the
       transition turns them into one motion. Short, so it never lags the
       fingers; `zoom` is animatable in WebKit and Chromium. */
    transition: zoom 90ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .wp-pages { transition: none; }
  }

  .wp-page {
    position: relative;
    /* Size, margins and padding are set inline from the format. */
    background: #ffffff;
    color: #000000;
    box-shadow: 0 1px 3px rgba(0, 0, 0, .18), 0 8px 24px rgba(0, 0, 0, .10);
    /* Offscreen pages skip layout entirely — a 40-page document would
       otherwise pay for 40 copies of the content on every scroll. */
    content-visibility: auto;
    contain-intrinsic-size: 794px 1123px;
  }
  /* The clipped window onto the shared content column: vertical clip only;
     the left padding (set inline) is where an outdented table shows. */
  .wp-window { overflow: hidden; position: relative; box-sizing: border-box; }

  /* The document title, in the header, with the rule under it — as the
     export's header1.xml renders it. */
  .wp-header {
    position: absolute;
    font-family: "Calibri Light", Calibri, Carlito, "Segoe UI", sans-serif;
    font-size: var(--title);
    font-weight: 700;
    color: #000;
    line-height: 1.22;
    padding-bottom: 4pt;
    border-bottom: 1px solid #000;
  }

  .wp-gutter {
    position: absolute;
    width: 30px;
  }
  .wp-lineno {
    position: absolute;
    right: 0;
    transform: translateY(-50%);
    font-family: "Calibri Light", Calibri, Carlito, "Segoe UI", sans-serif;
    font-size: 8pt;
    color: #9a9a9a;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  /* The footer: configurable text left, "Page X of Y" right — the same as
     footer1.xml. 0.4in up from the page edge. */
  .wp-footer {
    position: absolute;
    bottom: 38px;
    display: flex;
    justify-content: space-between;
    font-family: Calibri, Carlito, "Segoe UI", sans-serif;
    font-size: var(--footer);
    color: #595959;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .wp-measure {
    position: absolute;
    left: -10000px;
    top: 0;
    visibility: hidden;
    pointer-events: none;
  }

  /* ─── Word-ish document styles ───────────────────────────────────────
     Deliberately hard-coded rather than themed: this is a preview of a page
     that will be printed or mailed, so it is black on white regardless of the
     app's theme. Sizes come in as CSS variables from the same Format the
     exporter uses (`--body`, `--title`, `--small`, `--step`, `--outdent`). */
  .wp-content {
    font-family: "Calibri Light", Calibri, Carlito, "Segoe UI", sans-serif;
    font-size: var(--body);
    /* Single spacing. Word's "single" for Calibri is ~1.22 of the size. */
    line-height: 1.22;
    color: #000;
    text-align: justify;
    hyphens: none;
  }
  .wp-content :global(p) { margin: 0 0 6pt; }

  /* A stray `#` after the first (the first went to the header) is a section. */
  .wp-content :global(h1),
  .wp-content :global(h2),
  .wp-content :global(h3),
  .wp-content :global(h4),
  .wp-content :global(h5),
  .wp-content :global(h6) {
    font-size: var(--body);
    font-weight: 700;
    color: #000;
    text-decoration: underline;
    text-underline-offset: 2px;
    line-height: 1.22;
    text-align: left;
    break-after: avoid;
  }
  .wp-content :global(h1),
  .wp-content :global(h2) { margin: 12pt 0 6pt; }
  .wp-content :global(h3),
  .wp-content :global(h4),
  .wp-content :global(h5),
  .wp-content :global(h6) { margin: 6pt 0 3pt; }
  .wp-content :global(h1:first-child),
  .wp-content :global(h2:first-child),
  .wp-content :global(h3:first-child) { margin-top: 0; }
  /* Section numbers from prepareHeadings: "1." then a tab stop at 0.3in for
     a `##`; "3.1" then one space for a `###`. */
  .wp-content :global(.hnum) { text-decoration: inherit; }
  .wp-content :global(.hnum[data-sep="tab"]) { display: inline-block; min-width: 0.3in; }
  .wp-content :global(.hnum[data-sep="space"])::after { content: " "; }

  /* Lists: marker flush with the body text, text one step in, wrapped lines
     under the text; each nested level steps another. 3pt between items, 6pt
     after the last one. Second-level numbers run a., b., c. */
  .wp-content :global(ul),
  .wp-content :global(ol) {
    margin: 0 0 6pt;
    padding-left: var(--step);
    list-style-position: outside;
    text-align: left;
  }
  .wp-content :global(ul) { list-style-type: disc; }
  .wp-content :global(ul ul) { list-style-type: circle; }
  .wp-content :global(ol ol) { list-style-type: lower-alpha; }
  .wp-content :global(li) { margin: 0 0 3pt; }
  .wp-content :global(li > ul),
  .wp-content :global(li > ol) { margin: 3pt 0 0; }
  .wp-content :global(li > p) { margin: 0; display: inline; }

  /* A block quote is a note: small italic grey, indented one step, no bar. */
  .wp-content :global(blockquote) {
    margin: 0 0 6pt;
    padding: 0 0 0 var(--step);
    border: 0;
    color: #595959;
    font-style: italic;
    font-size: var(--small);
    text-align: left;
  }
  .wp-content :global(blockquote p) { margin: 0 0 3pt; }
  .wp-content :global(blockquote p:last-child) { margin-bottom: 0; }

  /* Tables: small, black header row with white text, thin grey borders, and
     wider than the text by the outdent so the left edge lines up with the
     line numbers while the right edge stays on the text. */
  .wp-content :global(table) {
    border-collapse: collapse;
    width: calc(100% + var(--outdent));
    margin: 0 0 6pt calc(-1 * var(--outdent));
    font-size: var(--small);
    text-align: left;
  }
  .wp-content :global(th),
  .wp-content :global(td) {
    border: 1px solid #8c8c8c;
    padding: 1pt 5pt 3pt;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
    line-height: 1.22;
  }
  .wp-content :global(th) { font-weight: 700; background: #000; color: #fff; }
  .wp-content :global(tr) { break-inside: avoid; }

  /* Figures: centred, capped at the column, captioned in small grey italics. */
  .wp-content :global(img) { max-width: 100%; height: auto; }
  .wp-content :global(p.wp-figure) { text-align: center; margin: 6pt 0 3pt; }
  .wp-content :global(p.wp-figure img) { display: inline-block; vertical-align: top; }
  .wp-content :global(p.wp-caption) {
    text-align: center;
    color: #595959;
    font-style: italic;
    font-size: var(--small);
    margin: 0 0 6pt;
  }

  /* Inline treatments the house format uses. */
  .wp-content :global(mark) { background: #ffff00; color: #000; }
  .wp-content :global(u) { text-decoration: underline; }
  .wp-content :global(a) { color: #0563c1; text-decoration: underline; }

  .wp-content :global(code) {
    font-family: Consolas, "Courier New", monospace;
    font-size: var(--small);
  }
  .wp-content :global(pre) {
    background: #f4f4f2;
    padding: 5pt 6pt;
    margin: 0 0 6pt;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: var(--small);
    line-height: 1.3;
    text-align: left;
  }
  /* A `---` is a thin grey rule with 6pt of air either side. The house format
     uses it sparingly, as a real divider, so it is drawn. */
  .wp-content :global(hr) {
    border: 0;
    border-bottom: 1px solid #a6a6a6;
    height: 0;
    margin: 6pt 0 8pt;
  }
  /* App furniture that has no business on a printed page. */
  .wp-content :global(.code-copy) { display: none; }
  .wp-content :global(.table-scroll) { overflow: visible; border: 0; border-radius: 0; margin: 0; }
</style>
