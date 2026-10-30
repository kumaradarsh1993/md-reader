/**
 * The fixed OOXML parts of a Fox MD `.docx`, and the house format they encode.
 *
 * ## The format, in one place
 *
 * The numbers live in `format.ts` (`resolveFormat`), which `WordPreview.svelte`
 * reads too — the preview's whole job is to be an honest picture of this
 * file. Change a rule here, change it there, or the preview starts lying.
 *
 *  - A4. Margins by preset (house: 0.7in sides, 0.75in top and bottom).
 *  - Calibri Light, body 10pt by default, justified, 6pt after each
 *    paragraph, single spacing. Continuous line numbers in the left margin.
 *  - The `#` title goes in the page header, body size + 1, bold, with a rule
 *    under it. The body therefore starts at the first `##`.
 *  - `##` sections are numbered "1.", "2.", … (tab after the number) and
 *    `###` sub-headings "3.1", "3.2", … (space after). Both bold, body size;
 *    sections underlined.
 *  - Lists: marker flush with the body text, text 0.25in in, nesting steps
 *    another 0.25in. 3pt between items, 6pt after the last.
 *  - Block quotes are notes: body − 1pt, italic grey, indented 0.25in, no bar.
 *  - Tables: body − 1pt, black header row, 0.3in into the left margin so they
 *    start where the line numbers end.
 *  - Footer: configurable left text, "Page X of Y" right.
 *
 * Units, because OOXML uses four of them and mixing them up is the usual bug:
 *  - **twip** = 1/20 pt = 1/1440 in — page size, margins, indents, spacing
 *  - **half-point** — font sizes (`w:sz`), so 11pt is `22`
 *  - **eighth-point** — border widths (`w:sz` inside `w:pBdr`), so 0.75pt is `6`
 *  - **EMU** = 1/914400 in — image extents only
 */

import {
  BODY_FONT,
  FOOTER_FONT,
  GREY_TEXT,
  INCH,
  MONO_FONT,
  PAGE_H_TWIPS,
  PAGE_W_TWIPS,
  PT,
  TABLE_BORDER,
  sz,
  type Format,
} from "./format";

export { PT, INCH, EMU_PER_INCH, BODY_FONT, MONO_FONT, GREY_TEXT, GREY_RULE, TABLE_BORDER } from "./format";

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function contentTypes(mediaExtensions: string[]): string {
  const defaults = new Set(["rels", "xml", ...mediaExtensions]);
  const typeFor: Record<string, string> = {
    rels: "application/vnd.openxmlformats-package.relationships+xml",
    xml: "application/xml",
    png: "image/png",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
  };
  const defaultTags = [...defaults]
    .filter((e) => typeFor[e])
    .map((e) => `<Default Extension="${e}" ContentType="${typeFor[e]}"/>`)
    .join("");
  return `${XML_DECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaultTags}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

export const PACKAGE_RELS = `${XML_DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

export const SETTINGS = `${XML_DECL}
<w:settings xmlns:w="${NS_W}"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

export function coreProps(title: string, now: Date): string {
  const iso = now.toISOString().replace(/\.\d+Z$/, "Z");
  return `${XML_DECL}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>Fox MD</dc:creator><cp:lastModifiedBy>Fox MD</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
}

export const APP_PROPS = `${XML_DECL}
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Fox MD</Application></Properties>`;

/**
 * Heading styles. The `#` title never reaches the body (it is in the header),
 * so Heading1 here is the `##` section: bold, underlined, body size, 12pt
 * before, with a tab stop 0.3in in for the section number. Heading2 is the
 * `###` sub-heading: bold, underlined, 6pt before. Deeper levels look like
 * Heading2 — the house format never writes them.
 */
function headingStyle(level: number, f: Format): string {
  const isSection = level === 1;
  const before = isSection ? 12 * PT : 6 * PT;
  const after = isSection ? 6 * PT : 3 * PT;
  // A `##` section is bold, not underlined, with one thin black rule under
  // the whole line (a paragraph border, so it runs margin to margin and the
  // number and the text sit on it together). The number is followed by a tab
  // to 0.25in, about 3 spaces. A `###` stays bold and underlined.
  const tabs = isSection ? `<w:tabs><w:tab w:val="left" w:pos="${Math.round(0.25 * INCH)}"/></w:tabs>` : "";
  const rule = isSection ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>` : "";
  const underline = isSection ? "" : `<w:u w:val="single"/>`;
  return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/>${rule}${tabs}<w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/>${underline}</w:rPr></w:style>`;
}

const TABLE_BORDERS = ["top", "left", "bottom", "right", "insideH", "insideV"]
  .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${TABLE_BORDER}"/>`)
  .join("");

/**
 * `styles.xml`. Besides Word's own names (Normal, heading N, List Paragraph,
 * caption, header, footer) there are three house styles: `Title` for the
 * header paragraph, `Note` for block quotes, `CodeBlock`/`CodeChar` for code.
 * Every paragraph style that is not prose resets `jc` to left, because the
 * document default is justified.
 */
export function styles(f: Format): string {
  const body = sz(f.bodyPt);
  const small = sz(f.smallPt);
  const title = sz(f.titlePt);
  const footer = sz(f.footerPt);
  const after = f.paraAfterTwips;
  const step = f.listStepTwips;
  return `${XML_DECL}
<w:styles xmlns:w="${NS_W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:cs="${BODY_FONT}"/><w:sz w:val="${body}"/><w:szCs w:val="${body}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${after}" w:line="240" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${[1, 2, 3, 4, 5, 6].map((l) => headingStyle(l, f)).join("")}<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="10"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr><w:color w:val="${GREY_TEXT}"/><w:sz w:val="${title}"/><w:szCs w:val="${title}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="${3 * PT}"/><w:jc w:val="left"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="${after}"/><w:ind w:left="${step}"/><w:jc w:val="left"/></w:pPr><w:rPr><w:i/><w:color w:val="${GREY_TEXT}"/><w:sz w:val="${small}"/><w:szCs w:val="${small}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="35"/><w:qFormat/><w:pPr><w:spacing w:before="${3 * PT}" w:after="${after}"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:color w:val="${GREY_TEXT}"/><w:sz w:val="${small}"/><w:szCs w:val="${small}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:spacing w:after="0"/><w:jc w:val="left"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:tabs><w:tab w:val="right" w:pos="${f.columnTwips}"/></w:tabs><w:spacing w:after="0"/><w:jc w:val="left"/></w:pPr><w:rPr><w:rFonts w:ascii="${FOOTER_FONT}" w:hAnsi="${FOOTER_FONT}" w:cs="${FOOTER_FONT}"/><w:color w:val="${GREY_TEXT}"/><w:sz w:val="${footer}"/><w:szCs w:val="${footer}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F4F2"/><w:spacing w:after="${after}" w:line="240" w:lineRule="auto"/><w:ind w:left="${6 * PT}" w:right="${6 * PT}"/><w:jc w:val="left"/></w:pPr><w:rPr><w:rFonts w:ascii="${MONO_FONT}" w:hAnsi="${MONO_FONT}" w:cs="${MONO_FONT}"/><w:sz w:val="${small}"/><w:szCs w:val="${small}"/></w:rPr></w:style><w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:uiPriority w:val="99"/><w:rPr><w:rFonts w:ascii="${MONO_FONT}" w:hAnsi="${MONO_FONT}" w:cs="${MONO_FONT}"/><w:sz w:val="${small}"/><w:shd w:val="clear" w:color="auto" w:fill="F0F0EE"/></w:rPr></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:tblPr><w:tblBorders>${TABLE_BORDERS}</w:tblBorders></w:tblPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="${1 * PT}" w:type="dxa"/><w:left w:w="${5 * PT}" w:type="dxa"/><w:bottom w:w="${1 * PT}" w:type="dxa"/><w:right w:w="${5 * PT}" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
}

const BULLETS = ["•", "◦", "▪"];

/**
 * A list level.
 *
 * **The child order below is the schema's, not a preference.** `CT_Lvl` is a
 * sequence — start, numFmt, lvlRestart, pStyle, isLgl, suff, lvlText,
 * lvlPicBulletId, legacy, lvlJc, pPr, rPr — and Word rejects the part outright
 * if an element appears out of turn, with no indication of which one.
 *
 * `<w:suff w:val="tab"/>` with a hanging indent is what makes the marker sit
 * at the left edge and every wrapped line align under the text.
 */
function lvl(ilvl: number, ordered: boolean, step: number): string {
  const left = (ilvl + 1) * step;
  const marker = ordered
    ? `%${ilvl + 1}.`
    : BULLETS[ilvl % BULLETS.length];
  // Nested numbered lists count a., b., c. — the house habit for a second level.
  const fmt = ordered ? (ilvl % 2 === 1 ? "lowerLetter" : "decimal") : "bullet";
  return `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlRestart w:val="0"/><w:suff w:val="tab"/><w:lvlText w:val="${xmlEscape(marker)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="${step}"/></w:pPr></w:lvl>`;
}

function abstractNum(id: number, ordered: boolean, step: number): string {
  const levels = Array.from({ length: 9 }, (_, i) => lvl(i, ordered, step)).join("");
  return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
}

/**
 * `numbering.xml`.
 *
 * Abstract 0 is the bullet ladder, abstract 1 the decimal one. Bullets can all
 * share a single concrete `w:num` because nothing counts. **Every ordered list
 * needs its own**, with a `startOverride`, or the second numbered list in a
 * document continues the first one's count — which is the classic Word bug
 * this avoids, and it also lets a markdown `5.` start actually start at 5.
 */
export function numbering(orderedStarts: number[], f: Format): string {
  const nums = [`<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`];
  orderedStarts.forEach((start, i) => {
    const overrides = Array.from(
      { length: 9 },
      (_, l) => `<w:lvlOverride w:ilvl="${l}"><w:startOverride w:val="${l === 0 ? start : 1}"/></w:lvlOverride>`,
    ).join("");
    nums.push(`<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/>${overrides}</w:num>`);
  });
  return `${XML_DECL}
<w:numbering xmlns:w="${NS_W}">${abstractNum(0, false, f.listStepTwips)}${abstractNum(1, true, f.listStepTwips)}${nums.join("")}</w:numbering>`;
}

/**
 * Section properties: A4, the chosen margins, continuous line numbers 0.3in
 * off the text (so they end where an outdented table begins), header and
 * footer. Closes the body.
 *
 * `CT_SectPr` is a sequence too: headerReference, footerReference, pgSz,
 * pgMar, lnNumType, cols, docGrid — in that order or Word refuses the part.
 */
export function sectPr(f: Format): string {
  const side = Math.round(f.marginSideIn * INCH);
  const tb = Math.round(f.marginTopIn * INCH);
  // Header text sits 0.35in from the paper edge; the body margin leaves room
  // for one header line plus its rule above the text.
  return `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="${PAGE_W_TWIPS}" w:h="${PAGE_H_TWIPS}"/><w:pgMar w:top="${tb}" w:right="${side}" w:bottom="${tb}" w:left="${side}" w:header="${Math.round(0.35 * INCH)}" w:footer="${Math.round(0.4 * INCH)}" w:gutter="0"/><w:lnNumType w:countBy="1" w:restart="continuous" w:distance="${f.tableOutdentTwips}"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`;
}

/**
 * `header1.xml`: the document title in light grey, no rule, on every page.
 * This is where the `#` goes, so the sections below it are the first tier.
 * An empty title gives an empty header.
 */
export function headerXml(title: string): string {
  const run = title ? `<w:r><w:t xml:space="preserve">${xmlEscape(title)}</w:t></w:r>` : "";
  const pPr = title ? `<w:pPr><w:pStyle w:val="Title"/></w:pPr>` : `<w:pPr><w:pStyle w:val="Header"/></w:pPr>`;
  return `${XML_DECL}
<w:hdr xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:p>${pPr}${run}</w:p></w:hdr>`;
}

/**
 * `footer1.xml`: the configurable text on the left ("Amazon Confidential" in
 * the house this was built for; empty means nothing there) and "Page X of Y"
 * flush right, from live PAGE and NUMPAGES fields so Word keeps them true.
 */
export function footerXml(leftText: string): string {
  const left = leftText
    ? `<w:r><w:t xml:space="preserve">${xmlEscape(leftText)}</w:t></w:r>`
    : "";
  const field = (instr: string, shown: string) =>
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${shown}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  return `${XML_DECL}
<w:ftr xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr>${left}<w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">Page </w:t></w:r>${field("PAGE", "1")}<w:r><w:t xml:space="preserve"> of </w:t></w:r>${field("NUMPAGES", "1")}</w:p></w:ftr>`;
}

export function documentXml(body: string, f: Format): string {
  return `${XML_DECL}
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}${sectPr(f)}</w:body></w:document>`;
}

export interface DocRel {
  id: string;
  type: "hyperlink" | "image";
  target: string;
}

export function documentRels(rels: DocRel[]): string {
  const fixed = `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`;
  const dynamic = rels
    .map((r) =>
      r.type === "hyperlink"
        ? `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(r.target)}" TargetMode="External"/>`
        : `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${xmlEscape(r.target)}"/>`,
    )
    .join("");
  return `${XML_DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${fixed}${dynamic}</Relationships>`;
}
