/**
 * Turning a DOM selection into a durable anchor, and back again.
 *
 * Everything here works in **block-local plain text**: for each top-level block
 * comrak emitted (which carries a `data-sourcepos`), the concatenation of its
 * text nodes. Offsets into that string are the coordinate system, because it is
 * the one thing that is stable across a re-render, a theme change, a font
 * change and the Find bar wrapping matches in `<mark>` elements.
 */

import type { Anchor } from "./types";

const CONTEXT = 48;

export interface BlockText {
  el: HTMLElement;
  /** 1-based source line the block starts on. */
  line: number;
  /** Concatenated text of every text node in the block, in document order. */
  text: string;
  /** Parallel index: each text node with its start offset in `text`. */
  nodes: Array<{ node: Text; from: number; to: number }>;
}

function sourceposLine(el: HTMLElement): number | null {
  const m = /^(\d+):/.exec(el.dataset.sourcepos ?? "");
  return m ? +m[1] : null;
}

/** Index every top-level block's text once, so resolution is a scan of strings. */
export function indexBlocks(prose: HTMLElement): BlockText[] {
  const out: BlockText[] = [];
  for (const child of Array.from(prose.children) as HTMLElement[]) {
    const line = sourceposLine(child);
    if (line == null) continue;
    out.push(readBlock(child, line));
  }
  return out;
}

function readBlock(el: HTMLElement, line: number): BlockText {
  const nodes: BlockText["nodes"] = [];
  let text = "";
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    // Skip UI the app injected into the document (the code-block copy button),
    // or its label lands inside every anchor that spans a code fence.
    if ((t.parentElement as HTMLElement | null)?.closest(".code-copy")) continue;
    const from = text.length;
    text += t.data;
    nodes.push({ node: t, from, to: text.length });
  }
  return { el, line, text, nodes };
}

/** The block a node sits inside, plus the node's offset within that block. */
function locate(blocks: BlockText[], node: Node, offset: number): { block: BlockText; at: number } | null {
  for (const b of blocks) {
    if (!b.el.contains(node)) continue;
    if (node.nodeType === Node.TEXT_NODE) {
      const entry = b.nodes.find((e) => e.node === node);
      if (entry) return { block: b, at: entry.from + offset };
      continue;
    }
    // A selection boundary can land on an element (between children). Take the
    // start of the first text node at or after that child index.
    const child = node.childNodes[offset] ?? null;
    for (const e of b.nodes) {
      if (!child || child.contains(e.node) || (child.compareDocumentPosition(e.node) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        return { block: b, at: e.from };
      }
    }
    return { block: b, at: b.text.length };
  }
  return null;
}

/**
 * Build an anchor from the current selection.
 *
 * Returns null when the selection is collapsed, lands outside the prose, or
 * crosses a block boundary. **Cross-block selections are refused on purpose**:
 * a comment on "the end of one paragraph and the start of the next" has no
 * stable meaning once either paragraph is edited, and supporting it would mean
 * every resolution path had to handle a range that may now be discontiguous.
 * Selecting inside one block is what people actually do when commenting.
 */
export function anchorFromSelection(prose: HTMLElement, sel: Selection): Anchor | null {
  if (sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!prose.contains(range.commonAncestorContainer)) return null;

  const blocks = indexBlocks(prose);
  const a = locate(blocks, range.startContainer, range.startOffset);
  const b = locate(blocks, range.endContainer, range.endOffset);
  if (!a || !b || a.block !== b.block) return null;

  let start = Math.min(a.at, b.at);
  let end = Math.max(a.at, b.at);
  const text = a.block.text;

  // Trim the whitespace a double-click or a drag past the last word picks up.
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  if (end <= start) return null;

  return {
    blockLine: a.block.line,
    start,
    length: end - start,
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
  };
}

/** Build a live DOM Range for an offset span inside a block. */
function rangeFor(block: BlockText, start: number, end: number): Range | null {
  const s = block.nodes.find((e) => start >= e.from && start < e.to)
    ?? block.nodes.find((e) => start === e.to);
  const t = block.nodes.find((e) => end > e.from && end <= e.to);
  if (!s || !t) return null;
  const r = document.createRange();
  r.setStart(s.node, start - s.from);
  r.setEnd(t.node, end - t.from);
  return r;
}

export interface Resolved {
  range: Range;
  /** True when the anchor had to be re-found — the caller persists the fix so
   *  the cheap path works next time. */
  repaired: boolean;
  /** The anchor as it should now be stored. */
  anchor: Anchor;
}

/**
 * Find where an anchor currently points.
 *
 * Four attempts, cheapest first:
 *  1. the named block, at the recorded offsets, if the text there still matches;
 *  2. the named block, searching for prefix+quote+suffix then quote alone;
 *  3. every block, same two searches — this is what survives a document whose
 *     paragraphs have moved;
 *  4. nothing, and the annotation is reported as detached rather than dropped.
 *
 * Step 3 costs a scan of the document's text per unresolved annotation, which
 * only happens for annotations that actually moved, and only once per render.
 */
export function resolveAnchor(blocks: BlockText[], anchor: Anchor): Resolved | null {
  const exact = blocks.find((b) => b.line === anchor.blockLine);
  if (exact) {
    const end = anchor.start + anchor.length;
    if (exact.text.slice(anchor.start, end) === anchor.quote) {
      const r = rangeFor(exact, anchor.start, end);
      if (r) return { range: r, repaired: false, anchor };
    }
    const found = searchBlock(exact, anchor);
    if (found) return found;
  }
  for (const b of blocks) {
    if (b === exact) continue;
    const found = searchBlock(b, anchor);
    if (found) return found;
  }
  return null;
}

function searchBlock(block: BlockText, anchor: Anchor): Resolved | null {
  const withContext = anchor.prefix + anchor.quote + anchor.suffix;
  let start = -1;

  const ctxAt = withContext.length > anchor.quote.length ? block.text.indexOf(withContext) : -1;
  if (ctxAt !== -1) {
    start = ctxAt + anchor.prefix.length;
  } else {
    // Without context, prefer the occurrence nearest to where it used to be —
    // a quote like "revenue" can appear a dozen times in one block.
    let from = 0;
    let best = -1;
    for (;;) {
      const at = block.text.indexOf(anchor.quote, from);
      if (at === -1) break;
      if (best === -1 || Math.abs(at - anchor.start) < Math.abs(best - anchor.start)) best = at;
      from = at + 1;
    }
    start = best;
  }
  if (start === -1) return null;

  const end = start + anchor.quote.length;
  const range = rangeFor(block, start, end);
  if (!range) return null;
  return {
    range,
    repaired: true,
    anchor: {
      ...anchor,
      blockLine: block.line,
      start,
      length: anchor.quote.length,
      prefix: block.text.slice(Math.max(0, start - CONTEXT), start),
      suffix: block.text.slice(end, end + CONTEXT),
    },
  };
}

/** The block-local offset at a viewport point — used to tell which highlight
 *  was clicked, since a `::highlight()` pseudo-element is not hit-testable. */
export function offsetAtPoint(
  blocks: BlockText[],
  x: number,
  y: number,
): { line: number; at: number } | null {
  const caret = document.caretRangeFromPoint?.(x, y);
  if (!caret) return null;
  const hit = locate(blocks, caret.startContainer, caret.startOffset);
  if (!hit) return null;
  return { line: hit.block.line, at: hit.at };
}
