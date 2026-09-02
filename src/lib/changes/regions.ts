/**
 * Turning "this file used to say A and now says B" into a handful of regions a
 * reader can look at one at a time.
 *
 * Three properties matter, and the existing theatre engine has none of them:
 *
 *  1. **Regions are block-aligned.** A change is grown out to whole paragraphs,
 *     because the margin bar has to span something a reader recognises as a
 *     unit, and because a diff that starts mid-sentence reads as damage.
 *  2. **Nearby changes merge.** Two edits in one paragraph are one region.
 *     Otherwise a rewritten section produces a picket fence of bars.
 *  3. **Regions carry their own text.** Storing before/after per region rather
 *     than whole-file snapshots is what keeps the on-disk record small enough
 *     to hold many revisions for many files.
 *
 * The theatre engine matches sections by exact heading text, which reports a
 * renamed heading as one deletion plus one addition and mis-pairs two sections
 * that happen to share a name (`## Notes`). Nothing here looks at headings.
 */

import DiffMatchPatch from "diff-match-patch";
import type { ChangedRegion, RegionKind } from "./types";

const dmp = new DiffMatchPatch.diff_match_patch();
// A second is a long time for a diff and a very long time for a scan that may
// be running over a folder. Past it, the library returns a coarser answer,
// which is the right trade: a slightly wide region beats a stalled window.
dmp.Diff_Timeout = 1.0;

/** Unchanged lines that may sit inside one region rather than splitting it.
 *  One blank line plus a line of prose is the common "edited two sentences of
 *  the same paragraph" shape, and splitting that into two bars is noise. */
const MERGE_WITHIN_LINES = 2;

/** Guard against a pathological diff painting the whole document. */
const MAX_REGIONS = 200;

interface RawRange {
  aFrom: number;
  aTo: number;
  bFrom: number;
  bTo: number;
  added: boolean;
  removed: boolean;
}

/**
 * Line-level diff, walked into raw before/after ranges.
 *
 * Line mode (rather than character mode) is right here because the output feeds
 * a *location*: what is wanted is "which lines of the new document are new", and
 * a character diff answers a question nobody asked and answers it messily for
 * prose. Word-level detail is reintroduced later, inside a region, where it is
 * cheap and actually readable — see `inlineOps`.
 */
function rawRanges(before: string, after: string): RawRange[] {
  const packed = dmp.diff_linesToChars_(before, after);
  const diffs = dmp.diff_main(packed.chars1, packed.chars2, false);
  dmp.diff_charsToLines_(diffs, packed.lineArray);
  dmp.diff_cleanupSemantic(diffs);

  const out: RawRange[] = [];
  let aLine = 1;
  let bLine = 1;
  let open: RawRange | null = null;

  for (const [op, text] of diffs) {
    const n = countLines(text);
    if (op === 0) {
      if (open) {
        out.push(open);
        open = null;
      }
      aLine += n;
      bLine += n;
      continue;
    }
    if (!open) {
      open = { aFrom: aLine, aTo: aLine - 1, bFrom: bLine, bTo: bLine - 1, added: false, removed: false };
    }
    if (op === 1) {
      open.bTo = bLine + n - 1;
      open.added = true;
      bLine += n;
    } else {
      open.aTo = aLine + n - 1;
      open.removed = true;
      aLine += n;
    }
  }
  if (open) out.push(open);
  return out;
}

/** Lines in a chunk, counting a trailing partial line. */
export function countLines(s: string): number {
  if (!s) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  if (s.charCodeAt(s.length - 1) !== 10) n++;
  return n;
}

/**
 * Grow `[from, to]` outwards until it sits on blank lines (or the document
 * ends) — i.e. until it covers whole blocks.
 *
 * Fenced code is the exception that forces this to be more than a blank-line
 * scan: a blank line inside a ``` fence is not a block boundary, and stopping
 * at one would cut a code block in half and show the reader a fragment.
 */
export function snapToBlocks(lines: string[], from: number, to: number): [number, number] {
  const fences = fenceLines(lines);
  let a = Math.max(1, Math.min(from, lines.length));
  let b = Math.max(a, Math.min(to, lines.length));

  while (a > 1) {
    const prev = lines[a - 2];
    if (prev.trim() === "" && !fences.has(a - 1)) break;
    a--;
  }
  while (b < lines.length) {
    const next = lines[b];
    if (next.trim() === "" && !fences.has(b + 1)) break;
    b++;
  }
  return [a, b];
}

/** 1-based line numbers that fall inside a fenced code block. */
function fenceLines(lines: string[]): Set<number> {
  const inside = new Set<number>();
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s{0,3}(```|~~~)/.test(lines[i])) {
      open = !open;
      inside.add(i + 1);
      continue;
    }
    if (open) inside.add(i + 1);
  }
  return inside;
}

/** Slice 1-based inclusive lines back into a string. */
function slice(lines: string[], from: number, to: number): string {
  if (to < from) return "";
  return lines.slice(from - 1, to).join("\n");
}

/**
 * The whole job: two versions in, locatable regions out.
 *
 * A brand-new file is deliberately **not** reported as one region covering
 * everything. "All of it is new" is true and useless — it would put a bar down
 * the entire document. The caller marks the revision `isNew` instead.
 */
export function diffRegions(before: string, after: string): ChangedRegion[] {
  if (before === after) return [];
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  const raw = rawRanges(before, after);
  if (raw.length === 0) return [];

  // Snap each range to block boundaries first, then merge — doing it the other
  // way round merges on unsnapped edges and produces regions that still start
  // mid-paragraph.
  const snapped = raw.map((r) => {
    // A pure removal has no lines in the new document to point at, so it is
    // anchored to the join between the blocks that survived around it.
    const bFrom = r.added ? r.bFrom : Math.max(1, r.bFrom - 1);
    const bTo = r.added ? r.bTo : Math.min(afterLines.length, r.bFrom);
    const [from, to] = snapToBlocks(afterLines, bFrom, bTo);
    const [aFrom, aTo] = r.removed
      ? snapToBlocks(beforeLines, r.aFrom, r.aTo)
      : [r.aFrom, r.aTo];
    return { from, to, aFrom, aTo, added: r.added, removed: r.removed };
  });

  const merged: typeof snapped = [];
  for (const s of snapped) {
    const last = merged[merged.length - 1];
    if (last && s.from - last.to <= MERGE_WITHIN_LINES + 1) {
      last.to = Math.max(last.to, s.to);
      last.aTo = Math.max(last.aTo, s.aTo);
      last.aFrom = Math.min(last.aFrom, s.aFrom);
      last.added = last.added || s.added;
      last.removed = last.removed || s.removed;
      continue;
    }
    merged.push({ ...s });
  }

  const out: ChangedRegion[] = [];
  for (const m of merged.slice(0, MAX_REGIONS)) {
    const kind: RegionKind = m.added && m.removed ? "changed" : m.added ? "added" : "removed";
    out.push({
      from: m.from,
      to: m.to,
      kind,
      before: m.removed ? slice(beforeLines, m.aFrom, m.aTo) : "",
      after: m.added ? slice(afterLines, m.from, m.to) : "",
    });
  }
  return out;
}

export interface InlineOp {
  kind: "equal" | "insert" | "delete";
  text: string;
}

/**
 * Word-level ops within one region, for the before/after overlay.
 *
 * `diff_cleanupSemantic` is what makes this readable rather than technically
 * correct: without it a prose edit comes back as a spray of single characters
 * that happen to coincide, and the reader has to reconstruct the actual change
 * themselves. With it, the ops land on word and phrase boundaries.
 *
 * Safe to run per region precisely because regions are small; running it over a
 * whole document is what makes character diffs unusable.
 */
export function inlineOps(before: string, after: string): InlineOp[] {
  if (before === after) return [{ kind: "equal", text: after }];
  const diffs = dmp.diff_main(before, after);
  dmp.diff_cleanupSemantic(diffs);
  return diffs.map(([op, text]) => ({
    kind: op === 0 ? "equal" : op === 1 ? "insert" : "delete",
    text,
  }));
}

/** "3 paragraphs changed", "1 paragraph added" — the one-line summary a hover
 *  preview and a list row both need. */
export function describeRegions(regions: ChangedRegion[]): string {
  if (regions.length === 0) return "no visible changes";
  const added = regions.filter((r) => r.kind === "added").length;
  const removed = regions.filter((r) => r.kind === "removed").length;
  const changed = regions.filter((r) => r.kind === "changed").length;
  const parts: string[] = [];
  if (changed) parts.push(`${changed} ${plural(changed, "passage")} changed`);
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  return parts.join(", ");
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
