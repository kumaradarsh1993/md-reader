/**
 * Diff engine for the Live Edit Theatre.
 *
 * Two responsibilities:
 *   1. Decompose a "before → after" pair of markdown texts into a list of
 *      changed *sections* (chunks bounded by ATX headings), each carrying its
 *      own before/after strings — that's what the sidebar renders.
 *   2. For a given section, compute red/green inline diff ops via
 *      diff-match-patch (line-mode for readability).
 *
 * Output is intentionally simple: no DOM, no rendering decisions. The
 * sidebar component is responsible for painting these structures.
 */

// `diff-match-patch` has no default export; ESM consumers import the namespace
// or the named class. The @types definition is `class diff_match_patch`.
import DiffMatchPatch from "diff-match-patch";

// One global instance — diff-match-patch is stateless across calls.
const dmp = new DiffMatchPatch.diff_match_patch();
// Cap per-diff CPU at 1s. Beyond that we fall back to a coarser diff.
dmp.Diff_Timeout = 1.0;

/** A single chunk of a diff in line-mode: an unchanged span, an insert, or a delete. */
export interface DiffOp {
  kind: "equal" | "insert" | "delete";
  text: string;
}

/**
 * Section-level diff — one entry per changed (or added/removed) markdown
 * section. Section boundaries are ATX headings (#, ##, …).
 */
export interface Section {
  /** Heading text, e.g. "Background". `(top)` for content before the first heading. */
  heading: string;
  /** Heading level 1–6. 0 for the implicit top-of-file section. */
  level: number;
  /** Section body as it was BEFORE the turn (empty for newly-added sections). */
  beforeText: string;
  /** Section body as it is AFTER the turn (empty for removed sections). */
  afterText: string;
  /** 1-based starting line number in the AFTER document. -1 if removed. */
  startLineAfter: number;
  /** Computed line ranges in the AFTER doc that contain changes. Used for
   *  yellow highlight painting via comrak's data-sourcepos. */
  changedLineRangesAfter: Array<{ from: number; to: number }>;
  /** Kind: changed, added, or removed. */
  changeKind: "changed" | "added" | "removed";
}

/**
 * Walk a markdown string and group lines into heading-bounded chunks.
 * Pre-heading content becomes a chunk with heading "(top)", level 0.
 */
function chunkByHeading(md: string): Array<{
  heading: string;
  level: number;
  startLine: number;
  text: string;
}> {
  const lines = md.split("\n");
  const chunks: Array<{ heading: string; level: number; startLine: number; text: string }> = [];
  let current = { heading: "(top)", level: 0, startLine: 1, text: "" };

  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (m) {
      // Push the previous chunk (even if empty — preserves structure for matching)
      chunks.push({ ...current });
      current = {
        heading: m[2].trim(),
        level: m[1].length,
        startLine: i + 1,
        text: lines[i] + "\n",
      };
    } else {
      current.text += lines[i] + (i < lines.length - 1 ? "\n" : "");
    }
  }
  chunks.push(current);
  return chunks.filter((c, idx) => idx === 0 || c.text.length > 0);
}

/**
 * Compute per-section changes between two snapshots of the same file.
 * Returns an empty array if the snapshots are identical.
 */
export function changedSections(before: string, after: string): Section[] {
  if (before === after) return [];

  const beforeChunks = chunkByHeading(before);
  const afterChunks = chunkByHeading(after);
  const out: Section[] = [];

  // Track which before-chunks we've matched, so we can identify removals.
  const matchedBefore = new Set<number>();

  for (const afterChunk of afterChunks) {
    // Match by (heading text, level) — coarse but works for well-structured docs.
    const beforeIdx = beforeChunks.findIndex(
      (b, i) =>
        !matchedBefore.has(i) &&
        b.heading === afterChunk.heading &&
        b.level === afterChunk.level,
    );
    if (beforeIdx >= 0) matchedBefore.add(beforeIdx);
    const beforeChunk = beforeIdx >= 0 ? beforeChunks[beforeIdx] : null;

    const beforeText = beforeChunk?.text ?? "";
    if (beforeText === afterChunk.text) continue; // identical, skip

    const isNew = !beforeChunk;
    out.push({
      heading: afterChunk.heading,
      level: afterChunk.level,
      beforeText,
      afterText: afterChunk.text,
      startLineAfter: afterChunk.startLine,
      changedLineRangesAfter: changedRanges(beforeText, afterChunk.text, afterChunk.startLine),
      changeKind: isNew ? "added" : "changed",
    });
  }

  // Sections that exist in before but were not matched in after → removed.
  for (let i = 0; i < beforeChunks.length; i++) {
    if (matchedBefore.has(i)) continue;
    const beforeChunk = beforeChunks[i];
    // Skip the empty implicit "(top)" stub if it has no body.
    if (beforeChunk.level === 0 && beforeChunk.text.trim() === "") continue;
    out.push({
      heading: beforeChunk.heading,
      level: beforeChunk.level,
      beforeText: beforeChunk.text,
      afterText: "",
      startLineAfter: -1,
      changedLineRangesAfter: [],
      changeKind: "removed",
    });
  }

  return out;
}

/**
 * Compute line ranges in the AFTER text that contain changes vs the BEFORE
 * text. Returns positions relative to the WHOLE document (use startLineAfter
 * as the offset).
 */
function changedRanges(
  before: string,
  after: string,
  afterStartLine: number,
): Array<{ from: number; to: number }> {
  // Newly-added section: all its lines are "changed" by definition.
  if (!before) {
    const lines = after.split("\n").length;
    return [{ from: afterStartLine, to: afterStartLine + lines - 1 }];
  }

  // Use line-mode diff for readability — character-mode produces messy ranges
  // for prose paragraphs.
  const a = dmp.diff_linesToChars_(before, after);
  const diffs = dmp.diff_main(a.chars1, a.chars2, false);
  dmp.diff_charsToLines_(diffs, a.lineArray);
  dmp.diff_cleanupSemantic(diffs);

  const ranges: Array<{ from: number; to: number }> = [];
  let afterLine = afterStartLine;
  let active: { from: number; to: number } | null = null;

  for (const [op, text] of diffs) {
    const linesIn = countLines(text);
    if (op === 0) {
      // Equal — flush any active range, advance line cursor.
      if (active) {
        ranges.push(active);
        active = null;
      }
      afterLine += linesIn;
    } else if (op === 1) {
      // Insert — these lines appear in AFTER.
      const from = afterLine;
      const to = afterLine + linesIn - 1;
      if (active) {
        active.to = Math.max(active.to, to);
      } else {
        active = { from, to };
      }
      afterLine += linesIn;
    } else {
      // Delete — text only existed in BEFORE; mark the position in AFTER.
      if (!active) active = { from: afterLine, to: afterLine };
    }
  }

  if (active) ranges.push(active);
  return ranges;
}

function countLines(s: string): number {
  if (!s) return 0;
  // Lines = number of newlines (each \n marks a line boundary). For trailing
  // text without a newline, we still count it.
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) n++;
  }
  // If the chunk has trailing chars after the last \n, that's an extra line.
  if (s.length > 0 && s.charCodeAt(s.length - 1) !== 10) n++;
  return n;
}

/**
 * Line-mode inline diff for the sidebar's "Naive" render mode. Returns a
 * flat list of ops suitable for line-by-line red/green rendering.
 */
export function lineDiff(before: string, after: string): DiffOp[] {
  const a = dmp.diff_linesToChars_(before, after);
  const diffs = dmp.diff_main(a.chars1, a.chars2, false);
  dmp.diff_charsToLines_(diffs, a.lineArray);
  dmp.diff_cleanupSemantic(diffs);
  return diffs.map(([op, text]) => ({
    kind: op === 0 ? "equal" : op === 1 ? "insert" : "delete",
    text,
  })) as DiffOp[];
}

/**
 * Whole-document line-mode diff: returns AFTER line ranges that differ from
 * BEFORE. Coarser than `changedSections` (no heading awareness) but cheap and
 * sufficient for delta-since-last-edit tracking driving the green/fresh
 * highlight phase.
 */
export function documentChangedRanges(
  before: string,
  after: string,
): Array<{ from: number; to: number }> {
  if (before === after) return [];
  if (!before) {
    const lines = after.split("\n").length;
    return [{ from: 1, to: lines }];
  }

  const a = dmp.diff_linesToChars_(before, after);
  const diffs = dmp.diff_main(a.chars1, a.chars2, false);
  dmp.diff_charsToLines_(diffs, a.lineArray);
  dmp.diff_cleanupSemantic(diffs);

  const ranges: Array<{ from: number; to: number }> = [];
  let afterLine = 1;
  let active: { from: number; to: number } | null = null;

  for (const [op, text] of diffs) {
    const linesIn = countLines(text);
    if (op === 0) {
      if (active) {
        ranges.push(active);
        active = null;
      }
      afterLine += linesIn;
    } else if (op === 1) {
      const from = afterLine;
      const to = afterLine + linesIn - 1;
      if (active) active.to = Math.max(active.to, to);
      else active = { from, to };
      afterLine += linesIn;
    } else {
      // Delete — text only existed in BEFORE; mark the position in AFTER.
      if (!active) active = { from: afterLine, to: afterLine };
    }
  }
  if (active) ranges.push(active);
  return ranges;
}

/** Total line-range count across all sections of a diff — useful for status bar copy. */
export function changedLineCount(sections: Section[]): number {
  let n = 0;
  for (const s of sections) {
    for (const r of s.changedLineRangesAfter) {
      n += r.to - r.from + 1;
    }
  }
  return n;
}
