/**
 * The fixed OOXML parts of a Fox MD `.docx`, and the house format they encode.
 *
 * ## The format, in one place
 *
 * Everything here mirrors `WordPreview.svelte` on purpose — the preview's whole
 * job is to be an honest picture of this file. If you change a number in one,
 * change it in the other, or the preview starts lying.
 *
 *  - A4, "moderate" margins trimmed: 0.75in left and right, 0.8in top and
 *    bottom. Text column 6.77in.
 *  - Calibri Light 11pt body, justified, 6pt after each paragraph, single
 *    spacing. Continuous line numbers down the left margin.
 *  - The `#` title is 12pt bold with a full-width rule under it. Every other
 *    heading is body size, bold and underlined (text only, no rule).
 *  - Lists: marker flush with the body text, text 0.25in in, nesting steps
 *    another 0.25in. 3pt between items, 6pt after the last.
 *  - Block quotes are 10pt italic grey notes, indented 0.25in, no bar.
 *  - Tables are 10pt with a black header row, and sit 0.3in into the left
 *    margin so they start where the line numbers do.
 *  - A footer: a configurable left text ("Amazon Confidential" in the house
 *    that asked for this) and "Page X of Y" on the right.
 *
 * The spec this encodes was written 2026-10-30 (v0.13.0-nightly.2) to replace
 * the v0.10 Letter/Normal-margins format with the owner's actual Word habits.
 *
 * Units, because OOXML uses four of them and mixing them up is the usual bug:
 *  - **twip** = 1/20 pt = 1/1440 in — page size, margins, indents, spacing
 *  - **half-point** — font sizes (`w:sz`), so 11pt is `22`
 *  - **eighth-point** — border widths (`w:sz` inside `w:pBdr`), so 0.75pt is `6`
 *  - **EMU** = 1/914400 in — image extents only
 */

export const PT = 20; // twips per point
export const INCH = 1440; // twips per inch
export const EMU_PER_INCH = 914400;

/** A4. */
export const PAGE_W = 11906;
export const PAGE_H = 16838;
export const MARGIN_SIDE = Math.round(0.75 * INCH); // 1080
export const MARGIN_TOP_BOTTOM = Math.round(0.8 * INCH); // 1152
/** Text column width in twips: A4 less two 0.75in margins. */
export const COLUMN_TWIPS = PAGE_W - 2 * MARGIN_SIDE; // 9746
export const COLUMN_INCHES = COLUMN_TWIPS / INCH; // 6.768

/** Tables reach 0.3in into the left margin, to the line-number column. */
export const TABLE_OUTDENT = Math.round(0.3 * INCH); // 432
export const TABLE_WIDTH = COLUMN_TWIPS + TABLE_OUTDENT; // 10178

export const BODY_FONT = "Calibri Light";
export const FOOTER_FONT = "Calibri";
export const MONO_FONT = "Consolas";
/** 11pt in half-points. */
export const BODY_SZ = 22;
/** The one larger size: the document title, 12pt. */
export const TITLE_SZ = 24;
/** Tables, notes and captions: 10pt. */
export const SMALL_SZ = 20;
/** Footer: 9pt. */
export const FOOTER_SZ = 18;
/** Code is a point smaller: it is not prose and the extra density helps. */
export const CODE_SZ = 20;
/** One nesting step for lists, in twips (0.25in). */
export const LIST_STEP = Math.round(0.25 * INCH); // 360
/** The grey used for notes, captions and the thin `---` rule. */
export const GREY_TEXT = "595959";
export const GREY_RULE = "A6A6A6";
export const TABLE_BORDER = "8C8C8C";

/** Default paragraph: 0pt before, 6pt after, single spacing, justified. */
export const PARA_AFTER = 6 * PT;

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
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaultTags}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
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

function headingStyle(level: number): string {
  // The `#` title alone is larger and carries the full-width rule (a paragraph
  // bottom border, so it runs the column, not just the words). Every other
  // level is body size, bold and underlined — in the house format a `##` is a
  // section and a `###` a sub-heading, and `####` and below are never written,
  // so they simply look like `###`.
  if (level === 1) {
    return `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="000000"/></w:pBdr><w:spacing w:before="0" w:after="${PARA_AFTER}" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="${TITLE_SZ}"/><w:szCs w:val="${TITLE_SZ}"/></w:rPr></w:style>`;
  }
  const before = level === 2 ? 12 * PT : 6 * PT;
  const after = level === 2 ? 6 * PT : 3 * PT;
  return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:u w:val="single"/></w:rPr></w:style>`;
}

const TABLE_BORDERS = ["top", "left", "bottom", "right", "insideH", "insideV"]
  .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${TABLE_BORDER}"/>`)
  .join("");

/**
 * `styles.xml`. Besides Word's own names (Normal, heading N, List Paragraph,
 * caption, footer) there are three house styles: `Note` for block quotes,
 * `CodeBlock` and `CodeChar` for code. Every paragraph style that is not prose
 * resets `jc` to left, because the document default is justified.
 */
export const STYLES = `${XML_DECL}
<w:styles xmlns:w="${NS_W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:cs="${BODY_FONT}"/><w:sz w:val="${BODY_SZ}"/><w:szCs w:val="${BODY_SZ}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${PARA_AFTER}" w:line="240" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${[1, 2, 3, 4, 5, 6].map(headingStyle).join("")}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="${3 * PT}"/><w:jc w:val="left"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="${PARA_AFTER}"/><w:ind w:left="${LIST_STEP}"/><w:jc w:val="left"/></w:pPr><w:rPr><w:i/><w:color w:val="${GREY_TEXT}"/><w:sz w:val="${SMALL_SZ}"/><w:szCs w:val="${SMALL_SZ}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="35"/><w:qFormat/><w:pPr><w:spacing w:before="${3 * PT}" w:after="${PARA_AFTER}"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:color w:val="${GREY_TEXT}"/><w:sz w:val="${SMALL_SZ}"/><w:szCs w:val="${SMALL_SZ}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:tabs><w:tab w:val="right" w:pos="${COLUMN_TWIPS}"/></w:tabs><w:spacing w:after="0"/><w:jc w:val="left"/></w:pPr><w:rPr><w:rFonts w:ascii="${FOOTER_FONT}" w:hAnsi="${FOOTER_FONT}" w:cs="${FOOTER_FONT}"/><w:color w:val="${GREY_TEXT}"/><w:sz w:val="${FOOTER_SZ}"/><w:szCs w:val="${FOOTER_SZ}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F4F2"/><w:spacing w:after="${PARA_AFTER}" w:line="240" w:lineRule="auto"/><w:ind w:left="${6 * PT}" w:right="${6 * PT}"/><w:jc w:val="left"/></w:pPr><w:rPr><w:rFonts w:ascii="${MONO_FONT}" w:hAnsi="${MONO_FONT}" w:cs="${MONO_FONT}"/><w:sz w:val="${CODE_SZ}"/><w:szCs w:val="${CODE_SZ}"/></w:rPr></w:style><w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:uiPriority w:val="99"/><w:rPr><w:rFonts w:ascii="${MONO_FONT}" w:hAnsi="${MONO_FONT}" w:cs="${MONO_FONT}"/><w:sz w:val="${CODE_SZ}"/><w:shd w:val="clear" w:color="auto" w:fill="F0F0EE"/></w:rPr></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:tblPr><w:tblBorders>${TABLE_BORDERS}</w:tblBorders></w:tblPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="${1 * PT}" w:type="dxa"/><w:left w:w="${5 * PT}" w:type="dxa"/><w:bottom w:w="${1 * PT}" w:type="dxa"/><w:right w:w="${5 * PT}" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;

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
 * at the left edge and every wrapped line align under the text. (v0.10 used
 * `space` and no indent, for a flush-left list; the house format indents.)
 */
function lvl(ilvl: number, ordered: boolean): string {
  // Marker at the level's left edge, text one step further in, wrapped lines
  // aligned under the text (a hanging indent). Level 0 therefore puts the
  // bullet flush with the body and the text 0.25in in.
  const left = (ilvl + 1) * LIST_STEP;
  const marker = ordered
    ? `%${ilvl + 1}.`
    : BULLETS[ilvl % BULLETS.length];
  // Nested numbered lists count a., b., c. — the house habit for a second level.
  const fmt = ordered ? (ilvl % 2 === 1 ? "lowerLetter" : "decimal") : "bullet";
  return `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlRestart w:val="0"/><w:suff w:val="tab"/><w:lvlText w:val="${xmlEscape(marker)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="${LIST_STEP}"/></w:pPr></w:lvl>`;
}

function abstractNum(id: number, ordered: boolean): string {
  const levels = Array.from({ length: 9 }, (_, i) => lvl(i, ordered)).join("");
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
export function numbering(orderedStarts: number[]): string {
  const nums = [`<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`];
  orderedStarts.forEach((start, i) => {
    const overrides = Array.from(
      { length: 9 },
      (_, l) => `<w:lvlOverride w:ilvl="${l}"><w:startOverride w:val="${l === 0 ? start : 1}"/></w:lvlOverride>`,
    ).join("");
    nums.push(`<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/>${overrides}</w:num>`);
  });
  return `${XML_DECL}
<w:numbering xmlns:w="${NS_W}">${abstractNum(0, false)}${abstractNum(1, true)}${nums.join("")}</w:numbering>`;
}

/**
 * Section properties: A4, the house margins, continuous line numbers 0.25in
 * off the text, and the footer. Closes the body.
 *
 * `CT_SectPr` is a sequence too: footerReference, pgSz, pgMar, lnNumType,
 * cols, docGrid — in that order or Word refuses the part.
 */
export const SECT_PR = `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="${MARGIN_TOP_BOTTOM}" w:right="${MARGIN_SIDE}" w:bottom="${MARGIN_TOP_BOTTOM}" w:left="${MARGIN_SIDE}" w:header="${Math.round(0.4 * INCH)}" w:footer="${Math.round(0.4 * INCH)}" w:gutter="0"/><w:lnNumType w:countBy="1" w:restart="continuous" w:distance="${LIST_STEP}"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`;

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

export function documentXml(body: string): string {
  return `${XML_DECL}
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}${SECT_PR}</w:body></w:document>`;
}

export interface DocRel {
  id: string;
  type: "hyperlink" | "image";
  target: string;
}

export function documentRels(rels: DocRel[]): string {
  const fixed = `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`;
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
