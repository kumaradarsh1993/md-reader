/**
 * Highlights and comments — the data model.
 *
 * ## The one decision everything else follows from
 *
 * An annotation is anchored to **rendered text**, not to markdown source
 * offsets. The selection is made in the rendered view, the highlight has to be
 * painted in the rendered view, and the markdown for a given passage is full of
 * characters that are not in it (`**`, `[](…)`, table pipes). Mapping a DOM
 * selection back through comrak's output to a source byte range means writing a
 * second, inexact markdown parser; anchoring where the user actually pointed
 * means none of that exists.
 *
 * What makes it survive an edit is the pair of coordinates:
 *  - `blockLine` + `start`/`length` resolve instantly when nothing moved;
 *  - `quote` with its `prefix`/`suffix` context re-finds the passage when the
 *    document has changed above it, which is the common case when an agent is
 *    editing the same file you are reading.
 *
 * This is the W3C Web Annotation model's TextPosition + TextQuote pairing,
 * for the same reason it exists there.
 */

export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "purple"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export interface Anchor {
  /** 1-based source line the containing block starts on (`data-sourcepos`). */
  blockLine: number;
  /** Offset of the selection start within that block's plain text. */
  start: number;
  /** Length in characters of the selected text. */
  length: number;
  /** The selected text itself — the recovery key, and what the sidecar quotes. */
  quote: string;
  /** Up to 48 characters of the block's text before the quote. */
  prefix: string;
  /** Up to 48 characters after it. */
  suffix: string;
}

export interface CommentNode {
  id: string;
  author: string;
  /** Markdown. Rendered as plain text with soft wraps; nobody writes tables
   *  in a margin note, and rendering it would mean a second render path. */
  body: string;
  createdAt: number;
  updatedAt?: number;
  replies: CommentNode[];
}

/**
 * One anchored mark.
 *
 * ## Fill and comment are independent, and that is the whole model
 *
 * The first version conflated them: "a comment is a highlight that has
 * something to say", so commenting on a passage silently painted it in a
 * highlighter colour the reader never chose. That is wrong — in any editor,
 * highlighting text and commenting on it are two separate acts, and either can
 * exist without the other.
 *
 * So an annotation carries two independent properties:
 *
 *  - **`color`** — the highlighter fill. `null` means *no fill*, which is a
 *    real, reachable state (that is what "No highlight" sets, and what a
 *    comment starts in), not a missing value.
 *  - **`thread`** — the conversation. Empty means there is nothing to say.
 *
 * All four combinations are meaningful except one: an annotation with no fill
 * **and** no thread has nothing left to be, and the store deletes it rather
 * than keeping an invisible anchor around.
 */
export interface Annotation {
  id: string;
  /**
   * @deprecated Provenance only — how the mark was first made. Never branch on
   * it: `color !== null` decides whether there is a fill, `thread.length > 0`
   * decides whether there is a comment. Kept so that a file written here still
   * opens in v0.10.0-nightly.1, and so the two never drift back together.
   */
  kind: "highlight" | "comment";
  /** The highlighter fill, or `null` for none. */
  color: HighlightColor | null;
  anchor: Anchor;
  thread: CommentNode[];
  createdAt: number;
  updatedAt: number;
  resolved: boolean;
}

/** Does this mark paint a highlighter fill? */
export function hasFill(ann: Annotation): boolean {
  return ann.color !== null && ann.color !== undefined;
}

/** Does this mark carry a conversation? */
export function hasThread(ann: Annotation): boolean {
  return ann.thread.length > 0;
}

/** Nothing left to show and nothing left to say — the store drops these. */
export function isEmptyMark(ann: Annotation): boolean {
  return !hasFill(ann) && !hasThread(ann);
}

/** What is written to `.foxmd/<name>.notes.json`. */
export interface NotesFile {
  /** Bumped only for a breaking change; readers tolerate unknown fields. */
  version: 1;
  /** Present so anything that opens this file cold knows what it is. */
  _readme: string;
  /** The document these notes belong to, as a bare filename. */
  document: string;
  updatedAt: number;
  annotations: Annotation[];
}

/** A resolved annotation: the model plus where it currently sits on screen. */
export interface Placed {
  ann: Annotation;
  /** Content-space Y of the top of the anchored text, px. */
  top: number;
  /** Content-space Y of the bottom. */
  bottom: number;
  /** The live DOM range, kept for painting. */
  range: Range;
}

export function newId(): string {
  // Time-ordered prefix so a sorted listing of ids is chronological, which
  // makes the JSON sidecar readable by eye in the order things were said.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Depth-first walk of a thread, so counting and rendering agree. */
export function walkThread(
  nodes: CommentNode[],
  visit: (node: CommentNode, depth: number, parent: CommentNode | null) => void,
  depth = 0,
  parent: CommentNode | null = null,
) {
  for (const n of nodes) {
    visit(n, depth, parent);
    walkThread(n.replies, visit, depth + 1, n);
  }
}

export function threadCount(ann: Annotation): number {
  let n = 0;
  walkThread(ann.thread, () => { n += 1; });
  return n;
}
