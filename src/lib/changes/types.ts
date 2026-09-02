/**
 * "What changed while I wasn't looking" — the data model.
 *
 * Two features live near each other and must not be confused:
 *
 *  - **Live edit theatre** (`theatre/`) animates a file being edited *while you
 *    watch it*. It is a spectacle, it is opt-in, and it forgets everything when
 *    the tab closes. That is fine — it is a nice-to-have.
 *  - **Changes** (this module) is the utility. It answers "any and all files
 *    touched since I last read them, and when", across files that are not open,
 *    after the app has been shut for a week. It remembers, because a record that
 *    does not survive a restart cannot answer that question.
 *
 * They are independently switchable and share no state.
 */

/** How a region differs from the previous known version. */
export type RegionKind = "added" | "changed" | "removed";

/**
 * One contiguous run of changed blocks, located in the *after* document.
 *
 * Both texts are stored on the region rather than as whole-file snapshots. A
 * region is a few paragraphs; a snapshot is the whole document. Storing regions
 * keeps the sidecar small enough to hold many revisions for many files without
 * the record itself becoming the largest thing in the folder.
 */
export interface ChangedRegion {
  /** 1-based inclusive line range in the *after* document. `data-sourcepos`
   *  on the rendered HTML is matched against this to place the margin bar. */
  from: number;
  to: number;
  kind: RegionKind;
  /** The text as it was. Empty for a pure addition. */
  before: string;
  /** The text as it is now. Empty for a pure removal. */
  after: string;
}

/** One observed transition of a file from one content to another. */
export interface Revision {
  /** Monotonic within a file. Stable across sessions — it is persisted. */
  id: number;
  /**
   * When the edit happened — the file's **mtime**, not when Fox MD noticed.
   *
   * This matters more than it looks. Changes are found by scanning, so if an
   * agent works for two hours while the app is in the background, every file it
   * touched is discovered in the same instant. Stamping that instant would
   * collapse two hours of work into one meaningless point and make "when did
   * this happen" unanswerable. The mtime is the real answer, and it is what
   * lets a run of revisions be read back as "Sunday, 8–10 pm".
   *
   * Falls back to discovery time only when the filesystem gives no mtime.
   */
  at: number;
  /** `external` — an agent or another editor. `local` — typed in Fox MD, and
   *  never marked, because you already know what you typed. */
  origin: "external" | "local";
  regions: ChangedRegion[];
  /** Cleared when the reader has actually looked at this. Never on a timer. */
  reviewed: boolean;
  /** Set when the file appeared for the first time rather than being edited. */
  isNew?: boolean;
  /** Set when the file grew past the size ceiling and regions were dropped —
   *  so the UI can say "changed, too large to show" instead of "no changes". */
  truncated?: boolean;
}

/** Everything known about one tracked file. */
export interface FileChanges {
  /** Absolute path. The key in the index. */
  path: string;
  /** mtime and size of the content the baseline holds. A file whose mtime and
   *  size both still match is not re-read — that is what makes a scan cheap. */
  seenMtime: number | null;
  seenSize: number;
  /** When the reader last had this file open and on screen. */
  lastReadAt: number | null;
  /** Newest first. Capped — see REVISION_CAP. */
  revisions: Revision[];
}

/** What is written to `.foxmd/changes.json`. */
export interface ChangesFile {
  version: 1;
  _readme: string;
  updatedAt: number;
  files: Record<string, FileChanges>;
}

/** Revisions kept per file before the oldest is dropped. */
export const REVISION_CAP = 40;

/**
 * Files larger than this get a revision recorded with no region content.
 *
 * Diffing is fast, but holding before-and-after text for a 2 MB generated file
 * in a JSON sidecar that is rewritten on every scan is not. The reader still
 * learns that it changed and when, which is the question being asked.
 */
export const MAX_DIFF_BYTES = 512 * 1024;

/** Count of revisions the reader has not yet looked at. */
export function unreviewedCount(f: FileChanges | undefined): number {
  if (!f) return 0;
  let n = 0;
  for (const r of f.revisions) if (!r.reviewed) n++;
  return n;
}

/** When this file last changed, or 0 if it never has. */
export function lastChangedAt(f: FileChanges | undefined): number {
  return f?.revisions[0]?.at ?? 0;
}

/**
 * Has this file changed since the reader last had it open?
 *
 * The comparison is against `lastReadAt` rather than against the reviewed flag
 * so that the answer survives a file being marked reviewed and then changing
 * again — which is the ordinary case when an agent is working in a loop.
 */
export function changedSinceRead(f: FileChanges | undefined): boolean {
  if (!f || f.revisions.length === 0) return false;
  if (f.lastReadAt === null) return true;
  return f.revisions[0].at > f.lastReadAt;
}
