/**
 * Markdown → OOXML body.
 *
 * ## Why this walks the rendered HTML rather than the markdown
 *
 * The app already has a correct, extension-complete markdown parser: comrak, in
 * Rust, with tables, task lists, strikethrough, footnotes, alerts, definition
 * lists and smart punctuation all switched on. Writing a second parser in
 * TypeScript to feed the exporter would mean two parsers that disagree — and
 * the one place they disagreed would be a document that previews correctly and
 * exports wrong. So the export re-renders the source through the *same* Rust
 * path and walks the resulting DOM.
 *
 * The DOM is parsed detached (`DOMParser`), not read off the Viewer, so export
 * works from any mode, does not depend on a mounted component, and never picks
 * up view-only decoration — diff highlights, Theatre spans, heading anchors.
 */

import { EMU_PER_INCH, GREY_RULE, PT, xmlEscape, type DocRel } from "./parts";
import { sz, type Format } from "./format";

export interface MediaFile {
  /** File name inside `word/media/`. */
  name: string;
  data: Uint8Array;
  /** Lower-case extension, for the content-type defaults. */
  ext: string;
}

export interface BuildResult {
  body: string;
  rels: DocRel[];
  media: MediaFile[];
  /** `start` attribute of each ordered list, in the order numIds were handed
   *  out. Index 0 becomes numId 2, index 1 numId 3, and so on. */
  orderedStarts: number[];
  /** Images referenced but not embedded, with the reason. Surfaced to the user
   *  rather than silently dropped. */
  skippedImages: string[];
}

/** Resolved image bytes, keyed by the `src` exactly as it appears in the DOM. */
export type ImageResolver = (src: string) => Promise<{ data: Uint8Array; ext: string } | null>;

interface RunStyle {
  b?: boolean;
  i?: boolean;
  /** `<u>` in the source — used for run-in headings inside list items. */
  u?: boolean;
  strike?: boolean;
  /** `==text==` → `<mark>`: the reviewer-check marker, yellow in Word too. */
  mark?: boolean;
  code?: boolean;
  link?: string;
  sup?: boolean;
  sub?: boolean;
  /** Half-points. Set only where a block is not body size (table cells). */
  sz?: number;
  /** Hex RGB without `#`. Table header text is white on black. */
  color?: string;
}

const BLOCK_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "PRE", "BLOCKQUOTE",
  "TABLE", "HR", "DL", "DIV", "SECTION", "DETAILS", "FIGURE",
]);

export class DocxBuilder {
  private out: string[] = [];
  private rels: DocRel[] = [];
  private media: MediaFile[] = [];
  private orderedStarts: number[] = [];
  private skippedImages: string[] = [];
  private relSeq = 0;
  private imageCache = new Map<string, string>(); // src -> relationship id
  private dimsCache = new Map<string, { w: number; h: number }>(); // src -> pixels
  /** "Figure N" counter for captioned images, in document order. */
  private figureSeq = 0;
  /** Column widths (inches) declared by a `<!-- widths: … -->` comment, held
   *  until the next table consumes them. */
  private pendingWidths: number[] | null = null;

  constructor(private resolveImage: ImageResolver, private f: Format) {}

  // Short names for the format values the walk uses on every block.
  private get step() { return this.f.listStepTwips; }
  private get after() { return this.f.paraAfterTwips; }
  private get small() { return sz(this.f.smallPt); }

  private nextRelId(): string {
    this.relSeq += 1;
    return `rIdX${this.relSeq}`;
  }

  /**
   * An HTML comment at block level. The one the house format uses is
   * `<!-- widths: 1.2, 2.5, 3.0 -->` on the line above a table — column widths
   * in inches, scaled to the table width if they do not add up. Any other
   * comment is ignored, as a comment should be.
   */
  comment(text: string): void {
    const m = /^\s*widths?\s*:\s*([\d.,\s]+)$/i.exec(text.trim());
    if (!m) return;
    const widths = m[1].split(",").map((s) => parseFloat(s.trim())).filter((n) => n > 0);
    this.pendingWidths = widths.length ? widths : null;
  }

  // ─── Runs ──────────────────────────────────────────────────────────────

  /**
   * A run's properties.
   *
   * The child order is `CT_RPr`'s: rStyle, rFonts, b, …, i, …, strike, …,
   * sz, szCs, highlight, u, …, vertAlign. Word does not repair an
   * out-of-order rPr, it refuses the part — so this order is a correctness
   * requirement, not tidiness.
   */
  private rPr(s: RunStyle): string {
    const parts: string[] = [];
    if (s.code) parts.push('<w:rStyle w:val="CodeChar"/>');
    else if (s.link) parts.push('<w:rStyle w:val="Hyperlink"/>');
    if (s.b) parts.push("<w:b/>");
    if (s.i) parts.push("<w:i/>");
    if (s.strike) parts.push("<w:strike/>");
    if (s.color) parts.push(`<w:color w:val="${s.color}"/>`);
    if (s.sz) parts.push(`<w:sz w:val="${s.sz}"/><w:szCs w:val="${s.sz}"/>`);
    if (s.mark) parts.push('<w:highlight w:val="yellow"/>');
    if (s.u) parts.push('<w:u w:val="single"/>');
    if (s.sup) parts.push('<w:vertAlign w:val="superscript"/>');
    if (s.sub) parts.push('<w:vertAlign w:val="subscript"/>');
    return parts.length ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
  }

  /**
   * One run of text.
   *
   * **Whitespace is collapsed the way HTML collapses it**, and that is a
   * correctness requirement rather than tidiness. A text node's newlines are
   * *formatting*, not content — comrak emits an explicit `<br/>` for a hard
   * break — so turning them into `<w:br/>` put a line break at the end of every
   * list item that contained a nested list, because the source has a newline
   * between `</li>` and `<ul>`.
   *
   * Whitespace-only nodes that contain a newline are dropped entirely: those
   * are the indentation between two block elements, and they render as nothing
   * in a browser. A whitespace-only node *without* a newline is a real space
   * between two inline runs ("this is " + **bold**) and is kept.
   */
  private textRun(raw: string, s: RunStyle): string {
    if (!raw) return "";
    const text = raw.replace(/\s+/g, " ");
    if (text === " " && /[\r\n]/.test(raw)) return "";
    return `<w:r>${this.rPr(s)}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
  }

  /** Walk inline content, accumulating formatting down the tree. */
  private async inline(node: Node, s: RunStyle): Promise<string> {
    if (node.nodeType === Node.TEXT_NODE) {
      return this.textRun(node.textContent ?? "", s);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName;

    if (tag === "BR") return "<w:r><w:br/></w:r>";

    if (tag === "IMG") return this.image(el as HTMLImageElement);

    if (tag === "INPUT") {
      // Task-list checkbox. comrak emits a disabled <input type="checkbox">;
      // Word has no such thing, so it becomes the character a printed checklist
      // uses. Kept as text so the box survives copy-paste and search.
      // No trailing space: the markdown source already has one after `[x]`, and
      // adding a second produced "☒  Done thing".
      const checked = (el as HTMLInputElement).checked || el.hasAttribute("checked");
      return this.textRun(checked ? "☒" : "☐", s);
    }

    const next: RunStyle = { ...s };
    if (tag === "STRONG" || tag === "B") next.b = true;
    if (tag === "EM" || tag === "I") next.i = true;
    if (tag === "U" || tag === "INS") next.u = true;
    if (tag === "MARK") next.mark = true;
    if (tag === "DEL" || tag === "S" || tag === "STRIKE") next.strike = true;
    if (tag === "CODE" || tag === "KBD" || tag === "SAMP") next.code = true;
    if (tag === "SUP") next.sup = true;
    if (tag === "SUB") next.sub = true;

    if (tag === "A") {
      const href = el.getAttribute("href") ?? "";
      // Only an absolute URL is a hyperlink Word can follow. A relative link to
      // another .md file means nothing outside this app, so it keeps its text
      // and loses its link rather than shipping a target that 404s.
      if (/^(https?|mailto):/i.test(href)) {
        const id = this.nextRelId();
        this.rels.push({ id, type: "hyperlink", target: href });
        const inner = await this.children(el, { ...next, link: href });
        return `<w:hyperlink r:id="${id}">${inner}</w:hyperlink>`;
      }
    }

    return this.children(el, next);
  }

  private async children(el: Node, s: RunStyle): Promise<string> {
    let out = "";
    for (const child of Array.from(el.childNodes)) out += await this.inline(child, s);
    return out;
  }

  // ─── Images ────────────────────────────────────────────────────────────

  private async image(img: HTMLImageElement): Promise<string> {
    const src = img.getAttribute("src") ?? "";
    const alt = img.getAttribute("alt") || "";
    if (!src) return "";

    let relId = this.imageCache.get(src);
    let dims = this.dimsCache.get(src) ?? { w: 0, h: 0 };

    if (!relId) {
      const resolved = await this.resolveImage(src);
      if (!resolved) {
        this.skippedImages.push(src);
        // Not silently dropped: the reader should be able to see that something
        // was there. Italic, in the document's own voice.
        return this.textRun(`[image: ${alt || src}]`, { i: true });
      }
      const name = `image${this.media.length + 1}.${resolved.ext}`;
      this.media.push({ name, data: resolved.data, ext: resolved.ext });
      relId = this.nextRelId();
      this.rels.push({ id: relId, type: "image", target: `media/${name}` });
      this.imageCache.set(src, relId);
      dims = sizeFromBytes(resolved.data, resolved.ext) ?? (await naturalSize(img));
      this.dimsCache.set(src, dims);
    }
    // Fit the text column, never upscale. EMU is 1/914400 in; the DOM reports
    // CSS pixels, which are 1/96 in by definition.
    const wIn = Math.min(this.f.columnIn, (dims.w || 480) / 96);
    const scale = dims.w ? wIn / (dims.w / 96) : 1;
    const hIn = ((dims.h || 320) / 96) * scale;
    const cx = Math.round(wIn * EMU_PER_INCH);
    const cy = Math.round(hIn * EMU_PER_INCH);
    const docId = this.media.length + 1000;
    const name = alt || `image${this.media.length}`;

    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docId}" name="${xmlEscape(name)}" descr="${xmlEscape(alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${docId}" name="${xmlEscape(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  /**
   * A paragraph that is nothing but one image — which is how markdown places a
   * figure. Centred, kept with its caption, and captioned "Figure N: alt text"
   * in small grey italics. No alt text means no caption and no number.
   */
  private async figure(img: HTMLImageElement): Promise<void> {
    const run = await this.image(img);
    if (!run) return;
    const alt = (img.getAttribute("alt") ?? "").trim();
    const embedded = run.includes("<w:drawing>");
    this.out.push(
      this.para(
        run,
        `<w:pPr><w:keepNext/><w:spacing w:before="${6 * PT}" w:after="${alt && embedded ? 3 * PT : this.after}"/><w:jc w:val="center"/></w:pPr>`,
      ),
    );
    if (alt && embedded) {
      this.figureSeq += 1;
      this.out.push(
        this.para(
          this.textRun(`Figure ${this.figureSeq}: ${alt}`, {}),
          `<w:pPr><w:pStyle w:val="Caption"/></w:pPr>`,
        ),
      );
    }
  }

  /** True when the element holds exactly one `<img>` and nothing but whitespace. */
  private static isFigure(el: HTMLElement): HTMLImageElement | null {
    let img: HTMLImageElement | null = null;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) {
        if ((n.textContent ?? "").trim()) return null;
        continue;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      if ((n as HTMLElement).tagName !== "IMG" || img) return null;
      img = n as HTMLImageElement;
    }
    return img;
  }

  // ─── Paragraphs and blocks ─────────────────────────────────────────────

  private para(runs: string, pPr = ""): string {
    return `<w:p>${pPr}${runs}</w:p>`;
  }

  private async blockChildren(el: Element, indent: number) {
    for (const child of Array.from(el.children)) {
      await this.block(child as HTMLElement, indent);
    }
  }

  async block(el: HTMLElement, indent = 0): Promise<void> {
    const tag = el.tagName;
    const ind = indent > 0 ? `<w:ind w:left="${indent}"/>` : "";

    if (/^H[1-6]$/.test(tag)) {
      // `prepareHeadings` has already removed the `#` title (it is in the page
      // header) and prefixed each `##`/`###` with a `.hnum` span. A `##` is the
      // document's first tier, so it takes Word's Heading 1; `###` and deeper
      // take Heading 2. A stray `<h1>` left in the body (an `h1` after the
      // first) is treated as a section too.
      const level = +tag[1];
      const styleLevel = level <= 2 ? 1 : 2;
      let runs = "";
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).classList.contains("hnum")) {
          const sep = (child as HTMLElement).getAttribute("data-sep") === "tab" ? "<w:r><w:tab/></w:r>" : this.textRun(" ", {});
          runs += this.textRun(child.textContent ?? "", {}) + sep;
          continue;
        }
        runs += await this.inline(child, {});
      }
      this.out.push(this.para(runs, `<w:pPr><w:pStyle w:val="Heading${styleLevel}"/>${ind}</w:pPr>`));
      return;
    }

    if (tag === "P") {
      const img = DocxBuilder.isFigure(el);
      if (img && indent === 0) {
        await this.figure(img);
        return;
      }
      const runs = await this.children(el, {});
      this.out.push(this.para(runs, ind ? `<w:pPr>${ind}</w:pPr>` : ""));
      return;
    }

    if (tag === "HR") {
      // A thin grey rule, 6pt of air either side. The house format uses `---`
      // sparingly, as a real divider, so it is drawn rather than swallowed.
      this.out.push(
        this.para(
          "",
          `<w:pPr><w:suppressLineNumbers/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="${GREY_RULE}"/></w:pBdr><w:spacing w:before="${6 * PT}" w:after="${6 * PT}"/><w:rPr><w:sz w:val="8"/></w:rPr></w:pPr>`,
        ),
      );
      return;
    }

    if (tag === "PRE") {
      const text = el.textContent ?? "";
      const lines = text.replace(/\n+$/, "").split("\n");
      const runs = lines
        .map((l, i) => (i === 0 ? "" : "<w:br/>") + `<w:t xml:space="preserve">${xmlEscape(l)}</w:t>`)
        .join("");
      this.out.push(
        this.para(
          `<w:r>${runs}</w:r>`,
          `<w:pPr><w:pStyle w:val="CodeBlock"/>${ind}</w:pPr>`,
        ),
      );
      return;
    }

    if (tag === "BLOCKQUOTE") {
      // House format: a quote is a note — 10pt italic grey, indented 0.25in,
      // no bar. Several paragraphs inside one quote sit 3pt apart; the last
      // takes the normal 6pt. GFM alerts (`> [!NOTE]`) keep their title, which
      // comrak has already turned into a <p class="markdown-alert-title">.
      const paras = Array.from(el.children) as HTMLElement[];
      for (let i = 0; i < paras.length; i++) {
        const p = paras[i];
        if (p.tagName === "UL" || p.tagName === "OL" || p.tagName === "TABLE" || p.tagName === "PRE") {
          await this.block(p, indent + this.step);
          continue;
        }
        const runs = await this.children(p, {});
        const after = i === paras.length - 1 ? this.after : 3 * PT;
        const left = indent + this.step;
        this.out.push(
          this.para(runs, `<w:pPr><w:pStyle w:val="Note"/><w:spacing w:after="${after}"/><w:ind w:left="${left}"/></w:pPr>`),
        );
      }
      return;
    }

    if (tag === "UL" || tag === "OL") {
      await this.list(el, 0, indent);
      return;
    }

    if (tag === "TABLE") {
      await this.table(el as HTMLTableElement);
      return;
    }

    if (tag === "DL") {
      for (const child of Array.from(el.children)) {
        const isTerm = child.tagName === "DT";
        const runs = await this.children(child, isTerm ? { b: true } : {});
        const childIndent = isTerm ? indent : indent + this.step;
        this.out.push(
          this.para(runs, `<w:pPr><w:ind w:left="${childIndent}"/><w:spacing w:after="${isTerm ? 0 : this.after}"/></w:pPr>`),
        );
      }
      return;
    }

    // Wrappers comrak or post-render introduce (the table scroller, <div>,
    // <details>, footnote <section>) — descend, don't drop.
    if (BLOCK_TAGS.has(tag) || tag === "SUMMARY") {
      if (el.children.length === 0) {
        const runs = await this.children(el, {});
        if (runs) this.out.push(this.para(runs, ind ? `<w:pPr>${ind}</w:pPr>` : ""));
        return;
      }
      await this.blockChildren(el, indent);
      return;
    }

    // Anything left is inline content sitting at block level.
    const runs = await this.children(el, {});
    if (runs) this.out.push(this.para(runs, ind ? `<w:pPr>${ind}</w:pPr>` : ""));
  }

  private async list(el: Element, level: number, baseIndent: number): Promise<void> {
    const ordered = el.tagName === "OL";
    let numId = 1;
    if (ordered) {
      const start = Number(el.getAttribute("start") ?? "1") || 1;
      this.orderedStarts.push(start);
      numId = this.orderedStarts.length + 1; // numId 1 is the shared bullet list
    }

    const items = Array.from(el.children).filter((c) => c.tagName === "LI");
    for (let idx = 0; idx < items.length; idx++) {
      const li = items[idx];

      // Split the item: its own inline content becomes the numbered paragraph,
      // nested lists recurse, and any other block (a code fence, a table) is
      // emitted after it at the same indent but without a marker.
      const inlineNodes: Node[] = [];
      const blockNodes: HTMLElement[] = [];
      for (const child of Array.from(li.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const ce = child as HTMLElement;
          if (ce.tagName === "UL" || ce.tagName === "OL" || ce.tagName === "PRE" ||
              ce.tagName === "TABLE" || ce.tagName === "BLOCKQUOTE") {
            blockNodes.push(ce);
            continue;
          }
          if (ce.tagName === "P" && li.childNodes.length > 1) {
            // A "loose" list item wraps each paragraph in <p>. The first joins
            // the marker; later ones become their own indented paragraphs.
            if (inlineNodes.length === 0) {
              inlineNodes.push(...Array.from(ce.childNodes));
            } else {
              blockNodes.push(ce);
            }
            continue;
          }
        }
        inlineNodes.push(child);
      }

      let runs = "";
      for (const n of inlineNodes) runs += await this.inline(n, {});
      const indAttr = baseIndent > 0 ? `<w:ind w:left="${baseIndent}"/>` : "";
      // 3pt between items (the style's default); the last item of a top-level
      // list that has no nested blocks after it takes the paragraph's 6pt.
      const isLast = idx === items.length - 1;
      const spacing = level === 0 && isLast && blockNodes.length === 0
        ? `<w:spacing w:after="${this.after}"/>`
        : "";
      this.out.push(
        this.para(
          runs,
          `<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${numId}"/></w:numPr>${spacing}${indAttr}</w:pPr>`,
        ),
      );

      for (const b of blockNodes) {
        if (b.tagName === "UL" || b.tagName === "OL") {
          await this.list(b, level + 1, baseIndent);
        } else {
          await this.block(b, baseIndent + (level + 1) * this.step);
        }
      }
    }
  }

  private async table(table: HTMLTableElement): Promise<void> {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length === 0) return;
    const cols = Math.max(...rows.map((r) => r.children.length));
    if (cols === 0) return;

    // Fixed layout. `auto` lets Word re-measure against the cells' content,
    // which for a table of long paths produces one 6in column and five
    // slivers — the same failure the reader's own tables had in v0.8.
    //
    // Widths: a `<!-- widths: … -->` comment above the table, in inches,
    // scaled to the table width if they do not add up. Otherwise equal.
    const total = this.f.tableWidthTwips;
    let widths: number[];
    const declared = this.pendingWidths;
    this.pendingWidths = null;
    if (declared && declared.length === cols) {
      const sum = declared.reduce((a, b) => a + b, 0);
      widths = declared.map((w) => Math.round((w / sum) * total));
    } else {
      widths = Array.from({ length: cols }, () => Math.floor(total / cols));
    }
    // Rounding drift goes to the last column so the grid sums to the width.
    widths[cols - 1] += total - widths.reduce((a, b) => a + b, 0);
    const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");

    // A column whose every body cell is a number is right-aligned.
    const numeric = Array.from({ length: cols }, (_, c) =>
      rows
        .filter((r) => r.closest("thead") === null)
        .every((r) => {
          const t = (r.children[c]?.textContent ?? "").trim();
          // One decimal point at most, so "2.7.6" (an ID) is text, "1,250.5%" a number.
          return t === "" || /^[-+−]?\d[\d,]*(\.\d+)?%?$/.test(t) || /^[$£€₹]\s?\d[\d,]*(\.\d+)?[kKmMbB]?$/.test(t);
        }),
    );
    const anyBodyRow = rows.some((r) => r.closest("thead") === null);

    const body: string[] = [];
    for (const tr of rows) {
      const isHead = tr.closest("thead") !== null;
      const cells: string[] = [];
      for (let c = 0; c < cols; c++) {
        const td = tr.children[c] as HTMLElement | undefined;
        const style: RunStyle = isHead
          ? { sz: this.small, b: true, color: "FFFFFF" }
          : { sz: this.small };
        const runs = td ? await this.children(td, style) : "";
        const align = td?.getAttribute("align") ?? td?.style.textAlign ?? "";
        const want = align === "center" || align === "right"
          ? align
          : !isHead && anyBodyRow && numeric[c] ? "right" : "";
        // Header: black fill, white bold text (the colour rides on the runs —
        // cell shading alone does not recolour text).
        const shd = isHead ? '<w:shd w:val="clear" w:color="auto" w:fill="000000"/>' : "";
        cells.push(
          `<w:tc><w:tcPr><w:tcW w:w="${widths[c]}" w:type="dxa"/>${shd}</w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="${2 * PT}" w:line="240" w:lineRule="auto"/><w:jc w:val="${want || "left"}"/></w:pPr>${runs}</w:p></w:tc>`,
        );
      }
      // `tblHeader` is what makes a long table repeat its header on every page.
      const trPr = isHead ? "<w:trPr><w:tblHeader/></w:trPr>" : "";
      body.push(`<w:tr>${trPr}${cells.join("")}</w:tr>`);
    }

    // The table reaches 0.3in into the left margin — its left edge lines up
    // with the line numbers, its right edge with the text.
    this.out.push(
      `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${total}" w:type="dxa"/><w:tblInd w:w="${-this.f.tableOutdentTwips}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body.join("")}</w:tbl>`,
    );
    // Word merges two tables that touch. A near-zero-height paragraph between
    // them is the standard separator; its 6pt after is the table's gap.
    this.out.push(this.para("", `<w:pPr><w:suppressLineNumbers/><w:spacing w:before="0" w:after="${this.after}" w:line="240" w:lineRule="auto"/><w:rPr><w:sz w:val="4"/></w:rPr></w:pPr>`));
  }

  result(): BuildResult {
    return {
      body: this.out.join(""),
      rels: this.rels,
      media: this.media,
      orderedStarts: this.orderedStarts,
      skippedImages: this.skippedImages,
    };
  }
}

/**
 * Image size from the file's own header. The DOM probe below cannot load a
 * relative path from a detached document (it resolves against the app, not
 * the markdown file), so before this every relative image exported at the
 * 480×320 fallback with the wrong aspect ratio. PNG, JPEG, GIF and BMP are
 * read here; anything else falls back to the probe.
 */
function sizeFromBytes(data: Uint8Array, ext: string): { w: number; h: number } | null {
  const be32 = (o: number) => ((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) >>> 0;
  const le16 = (o: number) => data[o] | (data[o + 1] << 8);
  const le32 = (o: number) => (data[o] | (data[o + 1] << 8) | (data[o + 2] << 16) | (data[o + 3] << 24)) >>> 0;
  try {
    if (ext === "png" && data.length > 24 && data[0] === 0x89 && data[1] === 0x50) {
      return { w: be32(16), h: be32(20) };
    }
    if (ext === "gif" && data.length > 10 && data[0] === 0x47 && data[1] === 0x49) {
      return { w: le16(6), h: le16(8) };
    }
    if (ext === "bmp" && data.length > 26 && data[0] === 0x42 && data[1] === 0x4d) {
      return { w: le32(18), h: Math.abs(le32(22) | 0) };
    }
    if (ext === "jpeg" && data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
      // Walk the segments to the first SOFn (C0–CF except C4, C8, CC).
      let o = 2;
      while (o + 9 < data.length) {
        if (data[o] !== 0xff) { o += 1; continue; }
        const marker = data[o + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
        const len = (data[o + 2] << 8) | data[o + 3];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { w: (data[o + 7] << 8) | data[o + 8], h: (data[o + 5] << 8) | data[o + 6] };
        }
        o += 2 + len;
      }
    }
  } catch { /* malformed header: let the probe decide */ }
  return null;
}

/** Decode just far enough to learn an image's intrinsic size. */
function naturalSize(img: HTMLImageElement): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    if (img.naturalWidth) return resolve({ w: img.naturalWidth, h: img.naturalHeight });
    const probe = new Image();
    const done = () => resolve({ w: probe.naturalWidth || 480, h: probe.naturalHeight || 320 });
    probe.onload = done;
    probe.onerror = () => resolve({ w: 480, h: 320 });
    probe.src = img.src;
    // A detached document's <img> never fetches, so `src` may be a bare relative
    // path that resolves to nothing. The fallback size keeps the export valid.
    setTimeout(done, 1200);
  });
}

