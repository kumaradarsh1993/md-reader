/**
 * Where the change record lives.
 *
 * `.foxmd/` beside the documents — the same place annotations already use, for
 * the same reasons: it is on OneDrive when the files are, it moves when the
 * folder moves, and an agent can read it.
 *
 * ## Two kinds of file, and why
 *
 * - **`.foxmd/changes.json`** — one per folder. Every tracked file's state and
 *   its revisions, including each region's before and after text. Read on every
 *   scan, so it is kept small: regions, never whole documents.
 *
 * - **`.foxmd/<name>.baseline.md`** — the last content Fox MD saw for one
 *   document. Needed because a diff needs something to diff *against*, and the
 *   whole point is to survive the app being closed.
 *
 * A baseline is only written for a file the reader has actually opened. That is
 * not a saving so much as the correct scope: the feature answers "changed since
 * I last read it", and a file nobody has read has no such moment. It also keeps
 * `.foxmd/` from filling with copies of every markdown file in a large tree.
 */

import { api } from "../api";
import type { ChangesFile, FileChanges } from "./types";

export const FOXMD_DIR = ".foxmd";

const README =
  "Fox MD change tracking. `changes.json` records what changed in this folder " +
  "and when; `*.baseline.md` are the last versions Fox MD saw, used to work out " +
  "the next diff. Safe to delete — Fox MD will start tracking again from now.";

export interface FolderPaths {
  dir: string;
  index: string;
  readme: string;
  sep: string;
}

/** Split a file path into its folder and bare name. */
export function splitPath(p: string): { folder: string; name: string; sep: string } | null {
  if (!p) return null;
  const sep = p.includes("\\") ? "\\" : "/";
  const cut = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  if (cut === -1) return null;
  return { folder: p.slice(0, cut), name: p.slice(cut + 1), sep };
}

export function folderPaths(folder: string): FolderPaths {
  const sep = folder.includes("\\") ? "\\" : "/";
  const dir = `${folder}${sep}${FOXMD_DIR}`;
  return { dir, index: `${dir}${sep}changes.json`, readme: `${dir}${sep}README.md`, sep };
}

export function baselinePath(docPath: string): string | null {
  const s = splitPath(docPath);
  if (!s) return null;
  return `${s.folder}${s.sep}${FOXMD_DIR}${s.sep}${s.name}.baseline.md`;
}

export async function loadBaseline(docPath: string): Promise<string | null> {
  const p = baselinePath(docPath);
  if (!p) return null;
  return api.readTextFileOpt(p);
}

export async function saveBaseline(docPath: string, content: string): Promise<void> {
  const p = baselinePath(docPath);
  if (!p) return;
  await api.writeTextFileMkdir(p, content);
}

export async function dropBaseline(docPath: string): Promise<void> {
  const p = baselinePath(docPath);
  if (p) await api.removeFileIfPresent(p);
}

export async function loadIndex(folder: string): Promise<Record<string, FileChanges>> {
  const p = folderPaths(folder);
  const raw = await api.readTextFileOpt(p.index);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ChangesFile;
    if (!parsed || typeof parsed.files !== "object" || parsed.files === null) return {};
    return parsed.files;
  } catch {
    // A corrupt index must not take the folder down with it, and must not be
    // silently overwritten either — it is the only copy of the history.
    console.error("[Fox MD] changes index is not valid JSON:", p.index);
    return {};
  }
}

/**
 * Write the index back.
 *
 * **Re-reads and merges first, deliberately.** Fox MD windows are separate OS
 * processes (see `spawn_window`), so two windows showing the same folder each
 * hold their own copy of this index. A plain write would let whichever scanned
 * last erase the other's record of what changed. Merging per file, keeping
 * whichever entry saw the later revision, makes concurrent windows converge
 * instead of fight.
 */
export async function saveIndex(
  folder: string,
  files: Record<string, FileChanges>,
): Promise<Record<string, FileChanges>> {
  const p = folderPaths(folder);
  const onDisk = await loadIndex(folder);
  const merged: Record<string, FileChanges> = { ...onDisk };

  for (const [path, mine] of Object.entries(files)) {
    const theirs = merged[path];
    merged[path] = theirs ? mergeFile(mine, theirs) : mine;
  }

  if (Object.keys(merged).length === 0) {
    await api.removeFileIfPresent(p.index);
    return merged;
  }

  const payload: ChangesFile = {
    version: 1,
    _readme: README,
    updatedAt: Date.now(),
    files: merged,
  };
  await api.writeTextFileMkdir(p.index, JSON.stringify(payload, null, 2));
  await api.writeTextFileIfAbsent(p.readme, README);
  return merged;
}

/**
 * Reconcile two views of one file's history.
 *
 * Revisions are unioned by id rather than replaced wholesale, because the two
 * windows may each have observed a change the other did not. `reviewed` is
 * OR-ed: if either window has been told the reader looked at it, they did — the
 * failure mode of the alternative is a change the reader has already dealt with
 * coming back, which is worse than one disappearing a moment early.
 */
function mergeFile(mine: FileChanges, theirs: FileChanges): FileChanges {
  const byId = new Map<number, FileChanges["revisions"][number]>();
  for (const r of theirs.revisions) byId.set(r.id, r);
  for (const r of mine.revisions) {
    const existing = byId.get(r.id);
    byId.set(r.id, existing ? { ...r, reviewed: r.reviewed || existing.reviewed } : r);
  }
  const revisions = [...byId.values()].sort((a, b) => b.at - a.at);
  const newer = (mine.seenMtime ?? 0) >= (theirs.seenMtime ?? 0) ? mine : theirs;
  return {
    path: mine.path,
    seenMtime: newer.seenMtime,
    seenSize: newer.seenSize,
    lastReadAt: Math.max(mine.lastReadAt ?? 0, theirs.lastReadAt ?? 0) || null,
    revisions,
  };
}
