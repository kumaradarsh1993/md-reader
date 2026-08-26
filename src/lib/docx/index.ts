/**
 * Markdown → `.docx`, with no model in the loop.
 *
 * ## Why this exists
 *
 * The workflow it serves: a document is drafted here as markdown, often by an
 * agent, and then has to reach a team as a Word file in the house format. Until
 * v0.10 the only way to do that was to ask a model to convert it — which costs a
 * round trip, is non-deterministic, and quietly rewrites the prose it was only
 * meant to reformat. A converter is a *rule*, not a judgement call. This is the
 * rule.
 *
 * The output is byte-for-byte reproducible from the same input, contains
 * exactly the text that went in, and matches what Page preview showed.
 */

import { api } from "../api";
import { zipStore, utf8, type ZipEntry } from "./zip";
import { DocxBuilder, type ImageResolver } from "./build";
import {
  APP_PROPS,
  PACKAGE_RELS,
  SETTINGS,
  STYLES,
  contentTypes,
  coreProps,
  documentRels,
  documentXml,
  numbering,
} from "./parts";

export interface DocxResult {
  bytes: Uint8Array;
  /** Image sources that could not be embedded — shown to the user, not hidden. */
  skippedImages: string[];
}

const RASTER = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp"]);

function extensionOf(src: string): string {
  const clean = src.split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  return dot === -1 ? "" : clean.slice(dot + 1).toLowerCase();
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked: `String.fromCharCode(...bytes)` on a multi-MB array blows the
  // argument limit and throws RangeError, which would surface as a failed save
  // only for documents with images in them.
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Join a document's folder with a relative image path, POSIX-style. */
function resolveRelative(basePath: string, src: string): string {
  const sep = basePath.includes("\\") ? "\\" : "/";
  const clean = src.replace(/^\.\//, "").split(/[?#]/)[0];
  return `${basePath.replace(/[\\/]+$/, "")}${sep}${clean.replace(/\//g, sep)}`;
}

function makeImageResolver(basePath: string): ImageResolver {
  const cache = new Map<string, { data: Uint8Array; ext: string } | null>();
  return async (src: string) => {
    if (cache.has(src)) return cache.get(src)!;
    let result: { data: Uint8Array; ext: string } | null = null;
    try {
      if (src.startsWith("data:")) {
        const m = /^data:image\/([a-z+]+);base64,(.*)$/i.exec(src);
        if (m && RASTER.has(m[1].toLowerCase())) {
          result = { data: base64ToBytes(m[2]), ext: m[1].toLowerCase() };
        }
      } else if (/^https?:/i.test(src)) {
        // Deliberately not fetched. The app runs a strict CSP with no external
        // `connect-src`, and widening it so an export can reach the network
        // would open that door for every rendered document. A remote image
        // becomes its alt text instead.
        result = null;
      } else {
        const ext = extensionOf(src);
        if (RASTER.has(ext)) {
          const abs = /^([a-zA-Z]:[\\/]|\/)/.test(src) ? src : resolveRelative(basePath, src);
          const b64 = await api.readFileBase64(abs);
          result = { data: base64ToBytes(b64), ext: ext === "jpg" ? "jpeg" : ext };
        }
      }
    } catch {
      result = null; // unreadable, wrong format, over the size limit — all "skip it"
    }
    cache.set(src, result);
    return result;
  };
}

/**
 * Build the `.docx` for a markdown source.
 *
 * `title` lands in the document properties, so the file shows a real name in
 * Word's title bar and in SharePoint listings rather than the file stem.
 */
export async function buildDocx(
  source: string,
  basePath: string,
  title: string,
): Promise<DocxResult> {
  // Re-render through the same Rust pipeline the reader uses. "light" is the
  // syntax palette; the exporter only ever reads `textContent` out of code
  // blocks, so the choice is irrelevant beyond being deterministic.
  const html = await api.renderMarkdown(source, "light");
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

  const builder = new DocxBuilder(makeImageResolver(basePath));
  for (const el of Array.from(doc.body.children)) {
    await builder.block(el as HTMLElement);
  }
  const built = builder.result();

  const now = new Date();
  const mediaExtensions = [...new Set(built.media.map((m) => m.ext))];

  const entries: ZipEntry[] = [
    // `[Content_Types].xml` first by convention — some strict readers expect to
    // find it without walking the central directory.
    { name: "[Content_Types].xml", data: utf8(contentTypes(mediaExtensions)) },
    { name: "_rels/.rels", data: utf8(PACKAGE_RELS) },
    { name: "docProps/core.xml", data: utf8(coreProps(title, now)) },
    { name: "docProps/app.xml", data: utf8(APP_PROPS) },
    { name: "word/document.xml", data: utf8(documentXml(built.body)) },
    { name: "word/_rels/document.xml.rels", data: utf8(documentRels(built.rels)) },
    { name: "word/styles.xml", data: utf8(STYLES) },
    { name: "word/numbering.xml", data: utf8(numbering(built.orderedStarts)) },
    { name: "word/settings.xml", data: utf8(SETTINGS) },
    ...built.media.map((m) => ({ name: `word/media/${m.name}`, data: m.data })),
  ];

  return { bytes: zipStore(entries, now), skippedImages: built.skippedImages };
}

/** Build and write in one step. Returns what could not be embedded. */
export async function exportDocx(
  source: string,
  basePath: string,
  title: string,
  targetPath: string,
): Promise<string[]> {
  const { bytes, skippedImages } = await buildDocx(source, basePath, title);
  await api.writeFileBase64(targetPath, bytesToBase64(bytes));
  return skippedImages;
}
