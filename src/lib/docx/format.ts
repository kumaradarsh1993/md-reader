/**
 * The house page format, as one object both the Page preview and the `.docx`
 * exporter read. Two knobs are the user's (body size, margins); everything
 * else derives from them, so the preview cannot drift from the file.
 *
 * Units: pt = points, in = inches, twips = 1/20 pt. Run sizes in OOXML are
 * half-points, so `sz(10)` is 20.
 */

export const PT = 20; // twips per point
export const INCH = 1440; // twips per inch
export const EMU_PER_INCH = 914400;

/** A4. */
export const PAGE_W_TWIPS = 11906;
export const PAGE_H_TWIPS = 16838;

export type MarginPreset = "narrow" | "house" | "wide";

/** Side / top-bottom margins in inches, per preset. */
export const MARGINS: Record<MarginPreset, { side: number; topBottom: number }> = {
  narrow: { side: 0.5, topBottom: 0.6 },
  house: { side: 0.7, topBottom: 0.75 },
  wide: { side: 1.0, topBottom: 1.0 },
};

export const BODY_PT_MIN = 9;
export const BODY_PT_MAX = 12;
export const BODY_PT_DEFAULT = 10;

export interface FormatOptions {
  /** Body text size in points. The title is one point larger; tables, notes
   *  and captions one point smaller; the footer two points smaller. */
  bodyPt: number;
  margins: MarginPreset;
  /** Left-hand footer text. Empty leaves only "Page X of Y". */
  footer: string;
}

export const DEFAULT_FORMAT: FormatOptions = { bodyPt: BODY_PT_DEFAULT, margins: "house", footer: "" };

/** Everything the renderers need, derived once from the options. */
export interface Format extends FormatOptions {
  titlePt: number;
  smallPt: number;
  footerPt: number;
  marginSideIn: number;
  marginTopIn: number;
  /** Text column width in inches and twips. */
  columnIn: number;
  columnTwips: number;
  /** Tables reach this far into the left margin, to the line numbers. */
  tableOutdentIn: number;
  tableOutdentTwips: number;
  tableWidthTwips: number;
  /** One list nesting step, inches and twips. */
  listStepIn: number;
  listStepTwips: number;
  /** Space after an ordinary paragraph, twips. */
  paraAfterTwips: number;
}

export function resolveFormat(o: Partial<FormatOptions> = {}): Format {
  const bodyPt = Math.min(BODY_PT_MAX, Math.max(BODY_PT_MIN, Math.round(o.bodyPt ?? BODY_PT_DEFAULT)));
  const margins: MarginPreset = o.margins && o.margins in MARGINS ? o.margins : "house";
  const m = MARGINS[margins];
  const columnTwips = PAGE_W_TWIPS - 2 * Math.round(m.side * INCH);
  const tableOutdentIn = 0.3;
  return {
    bodyPt,
    margins,
    footer: o.footer ?? "",
    // The title sits in the header in grey at body size, as in Rahul's OP1.
    titlePt: bodyPt,
    smallPt: bodyPt - 1,
    footerPt: Math.max(7, bodyPt - 2),
    marginSideIn: m.side,
    marginTopIn: m.topBottom,
    columnIn: columnTwips / INCH,
    columnTwips,
    tableOutdentIn,
    tableOutdentTwips: Math.round(tableOutdentIn * INCH),
    tableWidthTwips: columnTwips + Math.round(tableOutdentIn * INCH),
    listStepIn: 0.25,
    listStepTwips: Math.round(0.25 * INCH),
    paraAfterTwips: 6 * PT,
  };
}

/** Points to OOXML half-points. */
export const sz = (pt: number) => Math.round(pt * 2);

export const BODY_FONT = "Calibri Light";
export const FOOTER_FONT = "Calibri";
export const MONO_FONT = "Consolas";
export const GREY_TEXT = "595959";
export const GREY_RULE = "A6A6A6";
export const TABLE_BORDER = "8C8C8C";

/**
 * Section numbering, shared by preview and export so the two agree.
 *
 * The house format numbers sections: `##` becomes "1.", "2.", … followed by a
 * tab; `###` becomes "3.1", "3.2", … followed by a single space. The `#` title
 * is not numbered and does not sit in the body at all: it goes to the page
 * header (export) or the top margin (preview), so the sections that follow
 * are the first tier, as in the documents this format copies.
 *
 * Operates on a parsed DOM in place. Returns the title text, or "" when the
 * document has no `#`. Headings below `###` are left as they are.
 */
export function prepareHeadings(root: ParentNode): { title: string } {
  let title = "";
  const h1 = root.querySelector("h1");
  if (h1) {
    title = (h1.textContent ?? "").trim();
    h1.remove();
  }
  let n2 = 0;
  let n3 = 0;
  for (const h of Array.from(root.querySelectorAll("h2, h3"))) {
    stripWrittenNumber(h);
    // "Appendix A: …" carries its own letter; "5. Appendix A" reads wrong.
    if (/^\s*appendix\b/i.test(h.textContent ?? "")) continue;
    const num = h.ownerDocument.createElement("span");
    num.className = "hnum";
    if (h.tagName === "H2") {
      n2 += 1;
      n3 = 0;
      num.textContent = `${n2}.`;
      num.setAttribute("data-sep", "tab");
    } else {
      // A `###` before any `##` reads "0.1": unusual, but honest.
      n3 += 1;
      num.textContent = `${n2}.${n3}`;
      num.setAttribute("data-sep", "space");
    }
    h.insertBefore(num, h.firstChild);
  }
  return { title };
}

/**
 * A heading the author already numbered by hand ("## 3.1 Trending", "## 2.
 * What we learned") would otherwise come out "3.1 3.1 Trending". The written
 * number goes; the computed one is the one that stays in step when sections
 * move. Only a leading "N", "N.", "N.N", "N.N." followed by a space is
 * removed, and only from the heading's first text node, so "## 2027 plan"
 * (no dot, no second number) is left alone.
 */
function stripWrittenNumber(h: Element): void {
  const first = h.firstChild;
  if (!first || first.nodeType !== 3 /* TEXT_NODE */) return;
  const text = first.textContent ?? "";
  const m = /^\s*(\d+\.\d+(\.\d+)*\.?|\d+\.)\s+/.exec(text);
  if (!m) return;
  first.textContent = text.slice(m[0].length);
}
