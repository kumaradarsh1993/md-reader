/**
 * The fixed OOXML parts of a Fox MD `.docx`, and the house format they encode.
 *
 * ## The format, in one place
 *
 * Everything here mirrors `WordPreview.svelte` on purpose — the preview's whole
 * job is to be an honest picture of this file. If you change a number in one,
 * change it in the other, or the preview starts lying.
 *
 *  - US Letter, Word "Normal" margins (1in on all four sides)
 *  - Calibri Light 11pt for **everything**, headings included. A heading is
 *    bold, and at level 1 it is ruled; it is never bigger.
 *  - 8pt after each paragraph, 1.08 line spacing (Word's own defaults)
 *  - A full-width rule under level-1 headings only
 *  - Lists sit flush with the body text; nesting steps 12pt
 *  - Block quotes are ordinary paragraphs
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

/** Text column width: Letter (8.5in) less two 1in margins. */
export const COLUMN_INCHES = 6.5;

export const BODY_FONT = "Calibri Light";
export const MONO_FONT = "Consolas";
/** 11pt in half-points. */
export const BODY_SZ = 22;
/** Code is a point smaller: it is not prose and the extra density helps. */
export const CODE_SZ = 20;
/** One nesting step for lists, in twips (12pt). */
export const LIST_STEP = 12 * PT;

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
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaultTags}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
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
  // Level 1 alone carries the rule. See WordPreview for why: a rule under every
  // heading turns a stack of sections into a striped page.
  const border =
    level === 1
      ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="auto"/></w:pBdr>'
      : "";
  return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${10 * PT}" w:after="${4 * PT}" w:line="259" w:lineRule="auto"/>${border}<w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/></w:rPr></w:style>`;
}

export const STYLES = `${XML_DECL}
<w:styles xmlns:w="${NS_W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:cs="${BODY_FONT}"/><w:sz w:val="${BODY_SZ}"/><w:szCs w:val="${BODY_SZ}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${8 * PT}" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${[1, 2, 3, 4, 5, 6].map(headingStyle).join("")}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="0"/><w:contextualSpacing/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F4F2"/><w:spacing w:after="${8 * PT}" w:line="240" w:lineRule="auto"/><w:ind w:left="${6 * PT}" w:right="${6 * PT}"/></w:pPr><w:rPr><w:rFonts w:ascii="${MONO_FONT}" w:hAnsi="${MONO_FONT}" w:cs="${MONO_FONT}"/><w:sz w:val="${CODE_SZ}"/><w:szCs w:val="${CODE_SZ}"/></w:rPr></w:style><w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:uiPriority w:val="99"/><w:rPr><w:rFonts w:ascii="${MONO_FONT}" w:hAnsi="${MONO_FONT}" w:cs="${MONO_FONT}"/><w:sz w:val="${CODE_SZ}"/><w:shd w:val="clear" w:color="auto" w:fill="F0F0EE"/></w:rPr></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="8C8C8C"/><w:left w:val="single" w:sz="4" w:space="0" w:color="8C8C8C"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="8C8C8C"/><w:right w:val="single" w:sz="4" w:space="0" w:color="8C8C8C"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="8C8C8C"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="8C8C8C"/></w:tblBorders></w:tblPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="${5 * PT}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="${5 * PT}" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;

const BULLETS = ["•", "◦", "▪"];

/**
 * A list level.
 *
 * **The child order below is the schema's, not a preference.** `CT_Lvl` is a
 * sequence — start, numFmt, lvlRestart, pStyle, isLgl, suff, lvlText,
 * lvlPicBulletId, legacy, lvlJc, pPr, rPr — and Word rejects the part outright
 * if an element appears out of turn, with no indication of which one.
 *
 * `<w:suff w:val="space"/>` is the piece that earns its keep: it puts a single
 * space after the marker instead of a tab to the next stop, which is the only
 * way to get a genuinely flush-left list. It is the OOXML equivalent of the
 * preview's `list-style-position: inside`.
 */
function lvl(ilvl: number, ordered: boolean): string {
  const indent = ilvl * LIST_STEP;
  const marker = ordered
    ? `%${ilvl + 1}.`
    : BULLETS[ilvl % BULLETS.length];
  const fmt = ordered ? "decimal" : "bullet";
  return `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlRestart w:val="0"/><w:suff w:val="space"/><w:lvlText w:val="${xmlEscape(marker)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${indent}" w:firstLine="0"/></w:pPr></w:lvl>`;
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

/** US Letter, Word "Normal" margins. Closes the body. */
export const SECT_PR = `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="${INCH}" w:right="${INCH}" w:bottom="${INCH}" w:left="${INCH}" w:header="720" w:footer="720" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`;

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
  const fixed = `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`;
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
