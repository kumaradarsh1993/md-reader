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

import {
  BODY_SZ,
  COLUMN_INCHES,
  EMU_PER_INCH,
  INCH,
  LIST_STEP,
  PT,
  xmlEscape,
  type DocRel,
} from "./parts";

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
  strike?: boolean;
  code?: boolean;
  link?: string;
  sup?: boolean;
  sub?: boolean;
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

  constructor(private resolveImage: ImageResolver) {}

  private nextRelId(): string {
    this.relSeq += 1;
    return `rIdX${this.relSeq}`;
  }

  // ─── Runs ──────────────────────────────────────────────────────────────

  /**
   * A run's properties.
   *
   * The child order is `CT_RPr`'s: rStyle, rFonts, b, …, strike, …, position,
   * sz, …. Word does not repair an out-of-order rPr, it refuses the part — so
   * this order is a correctness requirement, not tidiness.
   */
  private rPr(s: RunStyle): string {
    const parts: string[] = [];
    if (s.code) parts.push('<w:rStyle w:val="CodeChar"/>');
    else if (s.link) parts.push('<w:rStyle w:val="Hyperlink"/>');
    if (s.b) parts.push("<w:b/>");
    if (s.i) parts.push("<w:i/>");
    if (s.strike) parts.push("<w:strike/>");
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
    const alt = img.getAttribute("alt") || "image";
    if (!src) return "";

    let relId = this.imageCache.get(src);
    let dims = { w: 0, h: 0 };

    if (!relId) {
      const resolved = await this.resolveImage(src);
      if (!resolved) {
        this.skippedImages.push(src);
        // Not silently dropped: the reader should be able to see that something
        // was there. Italic, in the document's own voice.
        return this.textRun(`[image: ${alt}]`, { i: true });
      }
      const name = `image${this.media.length + 1}.${resolved.ext}`;
      this.media.push({ name, data: resolved.data, ext: resolved.ext });
      relId = this.nextRelId();
      this.rels.push({ id: relId, type: "image", target: `media/${name}` });
      this.imageCache.set(src, relId);
    }

    dims = await naturalSize(img);
    // Fit the text column, never upscale. EMU is 1/914400 in; the DOM reports
    // CSS pixels, which are 1/96 in by definition.
    const wIn = Math.min(COLUMN_INCHES, (dims.w || 480) / 96);
    const scale = dims.w ? wIn / (dims.w / 96) : 1;
    const hIn = ((dims.h || 320) / 96) * scale;
    const cx = Math.round(wIn * EMU_PER_INCH);
    const cy = Math.round(hIn * EMU_PER_INCH);
    const docId = this.media.length + 1000;

    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docId}" name="${xmlEscape(alt)}" descr="${xmlEscape(alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${docId}" name="${xmlEscape(alt)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
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
      const level = +tag[1];
      const runs = await this.children(el, {});
      this.out.push(this.para(runs, `<w:pPr><w:pStyle w:val="Heading${level}"/>${ind}</w:pPr>`));
      return;
    }

    if (tag === "P") {
      const runs = await this.children(el, {});
      this.out.push(this.para(runs, ind ? `<w:pPr>${ind}</w:pPr>` : ""));
      return;
    }

    if (tag === "HR") {
      // A thematic break is a break, not a printed line — the same decision the
      // page preview makes. It becomes a paragraph of air.
      this.out.push(this.para("", `<w:pPr><w:spacing w:after="${11 * PT}"/></w:pPr>`));
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
      // House format: a quote is an ordinary paragraph. No bar, no indent, no
      // italic — in a Word document that is what it is. GFM alerts
      // (`> [!NOTE]`) keep their title, which comrak has already turned into a
      // <p class="markdown-alert-title">, so the label survives as bold text.
      await this.blockChildren(el, indent);
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
        const childIndent = isTerm ? indent : indent + LIST_STEP;
        this.out.push(
          this.para(runs, `<w:pPr><w:ind w:left="${childIndent}"/><w:spacing w:after="${isTerm ? 0 : 8 * PT}"/></w:pPr>`),
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

    for (const li of Array.from(el.children)) {
      if (li.tagName !== "LI") continue;

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
      this.out.push(
        this.para(
          runs,
          `<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${numId}"/></w:numPr>${indAttr}</w:pPr>`,
        ),
      );

      for (const b of blockNodes) {
        if (b.tagName === "UL" || b.tagName === "OL") {
          await this.list(b, level + 1, baseIndent);
        } else {
          await this.block(b, baseIndent + (level + 1) * LIST_STEP);
        }
      }
    }
  }

  private async table(table: HTMLTableElement): Promise<void> {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length === 0) return;
    const cols = Math.max(...rows.map((r) => r.children.length));
    if (cols === 0) return;

    // Fixed layout with an even split. `auto` lets Word re-measure against the
    // cells' content, which for a table of long paths produces one 6in column
    // and five slivers — the same failure the reader's own tables had in v0.8.
    const total = Math.round(COLUMN_INCHES * INCH);
    const colW = Math.floor(total / cols);
    const grid = Array.from({ length: cols }, () => `<w:gridCol w:w="${colW}"/>`).join("");

    const body: string[] = [];
    for (const tr of rows) {
      const isHead = tr.closest("thead") !== null;
      const cells: string[] = [];
      for (let c = 0; c < cols; c++) {
        const td = tr.children[c] as HTMLElement | undefined;
        const runs = td ? await this.children(td, isHead ? { b: true } : {}) : "";
        const align = td?.getAttribute("align") ?? td?.style.textAlign ?? "";
        const jc = align === "center" || align === "right"
          ? `<w:jc w:val="${align}"/>`
          : "";
        cells.push(
          `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/>${isHead ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F0"/>' : ""}</w:tcPr><w:p><w:pPr><w:spacing w:after="${2 * PT}" w:line="240" w:lineRule="auto"/>${jc}</w:pPr>${runs}</w:p></w:tc>`,
        );
      }
      // `tblHeader` is what makes a long table repeat its header on every page.
      const trPr = isHead ? "<w:trPr><w:tblHeader/></w:trPr>" : "";
      body.push(`<w:tr>${trPr}${cells.join("")}</w:tr>`);
    }

    this.out.push(
      `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body.join("")}</w:tbl>`,
    );
    // Word merges two tables that touch. An empty paragraph between them is the
    // standard separator, and it also gives the cursor somewhere to land.
    this.out.push(this.para("", `<w:pPr><w:spacing w:after="${4 * PT}"/></w:pPr>`));
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

/** Body text size in half-points — re-exported so callers don't import parts. */
export const DEFAULT_SZ = BODY_SZ;
