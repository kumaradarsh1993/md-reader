/**
 * Where annotations live on disk, and why there are two files.
 *
 * ## Location: `.foxmd/` beside the document
 *
 * Not inside the markdown. A highlight is the reader's state, not the
 * document's content, and writing HTML comments into a file that an agent is
 * concurrently rewriting is a merge conflict waiting to happen — it would also
 * change the file's bytes every time someone dragged a cursor across a word.
 *
 * Not in the app's own settings store either. The requirement is that **an
 * agent reading the document can read the feedback on it**, which means the
 * notes have to live next to the document, travel with it, and sync with it.
 * `.foxmd/` beside the file is on OneDrive when the file is on OneDrive, moves
 * when the folder moves, and is one obvious place to look.
 *
 * ## Two files, one direction
 *
 * `<name>.notes.json` is the source of truth: exact offsets, ids, timestamps,
 * thread structure. Nothing reads the markdown back.
 *
 * `<name>.notes.md` is generated from it on every save and is what a person or
 * an agent actually reads — each passage quoted, with the thread underneath in
 * order. It is strictly derived, so there is no sync problem: if it were ever
 * lost or hand-edited, the next save regenerates it.
 *
 * A `.foxmd/README.md` is written once per folder to explain the pair, so
 * finding the directory is enough to understand it without being told.
 */

import { api } from "../api";
import type { Annotation, CommentNode, NotesFile } from "./types";
import { walkThread } from "./types";

export const NOTES_DIR = ".foxmd";

const READ_ME =
  "Fox MD reader notes. `.notes.json` is authoritative; `.notes.md` is generated from it for reading.";

export interface SidecarPaths {
  dir: string;
  json: string;
  markdown: string;
  readme: string;
  /** Bare file name of the document, e.g. `report.md`. */
  document: string;
  /** The separator this platform's paths use. */
  sep: string;
}

export function sidecarPaths(docPath: string): SidecarPaths | null {
  if (!docPath) return null;
  const sep = docPath.includes("\\") ? "\\" : "/";
  const cut = Math.max(docPath.lastIndexOf("\\"), docPath.lastIndexOf("/"));
  if (cut === -1) return null;
  const folder = docPath.slice(0, cut);
  const document = docPath.slice(cut + 1);
  const dir = `${folder}${sep}${NOTES_DIR}`;
  return {
    dir,
    document,
    sep,
    json: `${dir}${sep}${document}.notes.json`,
    markdown: `${dir}${sep}${document}.notes.md`,
    readme: `${dir}${sep}README.md`,
  };
}

export async function loadNotes(docPath: string): Promise<Annotation[]> {
  const p = sidecarPaths(docPath);
  if (!p) return [];
  const raw = await api.readTextFileOpt(p.json);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as NotesFile;
    if (!Array.isArray(parsed.annotations)) return [];
    // Tolerate a file written by a newer version: unknown fields ride along in
    // memory and are written back, so an older build never silently drops them.
    return parsed.annotations.filter((a) => a && a.id && a.anchor);
  } catch {
    // A corrupt sidecar must never take the document down with it. The file is
    // left alone rather than overwritten, so it can still be recovered by hand.
    console.error("[Fox MD] notes sidecar is not valid JSON:", p.json);
    return [];
  }
}

export async function saveNotes(docPath: string, annotations: Annotation[]): Promise<void> {
  const p = sidecarPaths(docPath);
  if (!p) return;

  if (annotations.length === 0) {
    // Nothing to say: remove the pair rather than leaving two empty files in
    // every folder anyone has ever opened a document in.
    await api.removeFileIfPresent(p.json);
    await api.removeFileIfPresent(p.markdown);
    return;
  }

  const payload: NotesFile = {
    version: 1,
    _readme: READ_ME,
    document: p.document,
    updatedAt: Date.now(),
    annotations,
  };
  await api.writeTextFileMkdir(p.json, JSON.stringify(payload, null, 2));
  await api.writeTextFileMkdir(p.markdown, renderDigest(p.document, annotations));
  await api.writeTextFileIfAbsent(p.readme, FOLDER_README);
}

const FOLDER_README = `# .foxmd

Reader notes written by [Fox MD](https://github.com/kumaradarsh1993/md-reader) —
the highlights and comments left on the markdown files in the folder above.

| File | What it is |
|---|---|
| \`<document>.notes.json\` | **Authoritative.** Exact anchors, ids, timestamps, thread structure. |
| \`<document>.notes.md\` | Generated from the JSON on every save, for reading. Safe to ignore; never hand-edit — it is overwritten. |

**If you are an AI assistant working on a document in the folder above**: read
its \`.notes.md\` to see what the reader marked and what they said about it.
Each entry quotes the exact passage the note is attached to. A note under
"Comments" is feedback addressed to whoever works on the document next.

To change a note, change the \`.json\` — the markdown is regenerated from it.
`;

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/** Blockquote the passage, collapsing its internal newlines so a multi-line
 *  selection stays one readable quote. */
function quoteBlock(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return `> ${flat}`;
}

function renderThread(nodes: CommentNode[]): string {
  const lines: string[] = [];
  walkThread(nodes, (n, depth) => {
    const pad = "  ".repeat(depth);
    const edited = n.updatedAt && n.updatedAt !== n.createdAt ? " *(edited)*" : "";
    lines.push(`${pad}- **${n.author}** · ${fmtDate(n.createdAt)}${edited}`);
    for (const l of n.body.split("\n")) {
      lines.push(`${pad}  ${l}`.trimEnd());
    }
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

export function renderDigest(document: string, annotations: Annotation[]): string {
  const sorted = [...annotations].sort(
    (a, b) => a.anchor.blockLine - b.anchor.blockLine || a.anchor.start - b.anchor.start,
  );
  const comments = sorted.filter((a) => a.thread.length > 0);
  const highlights = sorted.filter((a) => a.thread.length === 0);

  const out: string[] = [
    `# Notes on ${document}`,
    "",
    `${comments.length} comment${comments.length === 1 ? "" : "s"} · ` +
      `${highlights.length} highlight${highlights.length === 1 ? "" : "s"} · ` +
      `generated ${fmtDate(Date.now())}`,
    "",
    "*Generated by Fox MD from `" + document + ".notes.json`. Do not edit — it is overwritten on every change.*",
    "",
  ];

  if (comments.length > 0) {
    out.push("## Comments", "");
    for (const a of comments) {
      out.push(`### Line ${a.anchor.blockLine}${a.resolved ? " — resolved" : ""}`, "");
      out.push(quoteBlock(a.anchor.quote), "");
      out.push(renderThread(a.thread), "");
    }
  }

  if (highlights.length > 0) {
    out.push("## Highlights", "");
    for (const a of highlights) {
      out.push(`- **Line ${a.anchor.blockLine}** (${a.color}) — ${a.anchor.quote.replace(/\s+/g, " ").trim()}`);
    }
    out.push("");
  }

  return out.join("\n");
}
