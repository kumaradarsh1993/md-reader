// End-to-end: rendered HTML (from the Rust example) -> .docx via the real
// DocxBuilder and parts. Mirrors buildDocx() in src/lib/docx/index.ts minus
// the Tauri api (the image resolver reads the disk directly here).
//
//   node run.bundle.mjs <in.html> <out.docx> [footer] [bodyPt] [margins]
import { parseHTML } from "linkedom";
import { readFileSync, writeFileSync } from "node:fs";
import { DocxBuilder } from "../../src/lib/docx/build.ts";
import { zipStore, utf8 } from "../../src/lib/docx/zip.ts";
import {
  APP_PROPS, PACKAGE_RELS, SETTINGS, contentTypes, coreProps,
  documentRels, documentXml, footerXml, headerXml, numbering, styles,
} from "../../src/lib/docx/parts.ts";
import { prepareHeadings, resolveFormat } from "../../src/lib/docx/format.ts";

const [,, htmlPath, outPath, footer = "", bodyPtArg = "10", marginsArg = "house"] = process.argv;
const html = readFileSync(htmlPath, "utf8");
const { document, Node, Image } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
globalThis.Node = Node;
globalThis.Image = Image ?? class { set src(_) { setTimeout(() => this.onerror?.(), 0); } };
globalThis.DOMParser = class { parseFromString(s) { return parseHTML(s).document; } };

const f = resolveFormat({ bodyPt: Number(bodyPtArg), margins: marginsArg, footer });
const { title } = prepareHeadings(document.body);

const builder = new DocxBuilder(async (src) => {
  try {
    const ext = src.split(".").pop().toLowerCase();
    return { data: new Uint8Array(readFileSync(src)), ext: ext === "jpg" ? "jpeg" : ext };
  } catch { return null; }
}, f);
for (const node of Array.from(document.body.childNodes)) {
  if (node.nodeType === Node.COMMENT_NODE) builder.comment(node.textContent ?? "");
  else if (node.nodeType === Node.ELEMENT_NODE) await builder.block(node);
}
const built = builder.result();
const now = new Date();
const entries = [
  { name: "[Content_Types].xml", data: utf8(contentTypes([...new Set(built.media.map(m => m.ext))])) },
  { name: "_rels/.rels", data: utf8(PACKAGE_RELS) },
  { name: "docProps/core.xml", data: utf8(coreProps(title || "Document", now)) },
  { name: "docProps/app.xml", data: utf8(APP_PROPS) },
  { name: "word/document.xml", data: utf8(documentXml(built.body, f)) },
  { name: "word/_rels/document.xml.rels", data: utf8(documentRels(built.rels)) },
  { name: "word/styles.xml", data: utf8(styles(f)) },
  { name: "word/numbering.xml", data: utf8(numbering(built.orderedStarts, f)) },
  { name: "word/settings.xml", data: utf8(SETTINGS) },
  { name: "word/header1.xml", data: utf8(headerXml(title)) },
  { name: "word/footer1.xml", data: utf8(footerXml(f.footer)) },
  ...built.media.map(m => ({ name: `word/media/${m.name}`, data: m.data })),
];
writeFileSync(outPath, zipStore(entries, now));
console.log("wrote", outPath, "title:", JSON.stringify(title), "skipped images:", built.skippedImages);
