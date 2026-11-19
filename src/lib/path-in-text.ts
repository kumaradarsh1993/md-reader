/**
 * Find an absolute file path in the document under a right-click.
 *
 * Handover notes and plans are full of paths written as plain text —
 * `/Users/me/Projects/plan.md`, `C:\Users\me\notes.md`, `~/code/app` — and
 * the useful thing to do with one is jump to it in Finder or Explorer. The
 * path is rarely a link, so this reads it out of the rendered text instead.
 *
 * Order of evidence, most deliberate first:
 *  1. a selection the user dragged across a path;
 *  2. an inline `code` span (how most docs write a path, spaces included);
 *  3. a `file://` link or a link whose href is an absolute path;
 *  4. a quoted or <angle-bracketed> run around the cursor (spaces allowed);
 *  5. the space-free token under the cursor.
 */

/** Matches the start of an absolute path: POSIX, home, drive letter, UNC. */
const ABSOLUTE = /^(?:~[\\/]|\/[^\s/]|[A-Za-z]:[\\/]|\\\\[^\\\s]+\\)/;

/** Strip a closing bracket only when it has no partner inside the path, so
 *  "…/explainers (30 Oct)" keeps its ")" but "(see /tmp/x)" loses it. */
function trimUnbalanced(s: string, open: string, close: string): string {
  while (s.endsWith(close) && s.split(close).length > s.split(open).length) {
    s = s.slice(0, -1);
  }
  return s;
}

/** Normalise a candidate string to an absolute path, or null if it is not one. */
export function asAbsolutePath(raw: string): string | null {
  let s = raw.trim();
  if (!s || s.includes("\n")) return null;

  // Wrapping quotes, backticks and angle brackets.
  s = s.replace(/^[<"'`“‘]+/, "").replace(/[>"'`”’]+$/, "");

  if (/^file:\/\//i.test(s)) {
    try {
      s = decodeURIComponent(new URL(s).pathname);
      if (/^\/[A-Za-z]:\//.test(s)) s = s.slice(1); // file:///C:/…
    } catch {
      return null;
    }
  }

  // Sentence punctuation that follows a path in prose.
  s = s.replace(/[.,;:!?]+$/, "");
  s = trimUnbalanced(s, "(", ")");
  s = trimUnbalanced(s, "[", "]");
  s = s.replace(/[.,;:!?]+$/, "");

  if (s.length < 3 || !ABSOLUTE.test(s)) return null;
  return s;
}

/** Characters that can open a delimited run, mapped to the one that closes it. */
const PAIRS: Record<string, string> = { "<": ">", '"': '"', "'": "'", "`": "`", "“": "”", "‘": "’" };

/** A delimited run (quotes or <…>) in `text` that contains `offset`. */
function delimitedAround(text: string, offset: number): string | null {
  for (const [open, close] of Object.entries(PAIRS)) {
    const start = text.lastIndexOf(open, offset);
    if (start < 0) continue;
    const end = text.indexOf(close, Math.max(offset, start + 1));
    if (end < 0) continue;
    const inner = text.slice(start + 1, end);
    const path = asAbsolutePath(inner);
    if (path) return path;
  }
  return null;
}

/** The whitespace-free token in `text` containing `offset`. */
function tokenAround(text: string, offset: number): string | null {
  let start = offset;
  let end = offset;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  while (end < text.length && !/\s/.test(text[end])) end++;
  let token = text.slice(start, end);
  // Prose often opens a path with a bracket: "(/Users/me/x)".
  token = token.replace(/^[([{]+/, "");
  return asAbsolutePath(token);
}

/** The text node and offset under a screen point. */
function caretAt(x: number, y: number): { node: Text; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos && pos.offsetNode.nodeType === Node.TEXT_NODE) {
    return { node: pos.offsetNode as Text, offset: pos.offset };
  }
  const range = document.caretRangeFromPoint?.(x, y);
  if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
    return { node: range.startContainer as Text, offset: range.startOffset };
  }
  return null;
}

/** The absolute path the user right-clicked on, if there is one. */
export function pathAtPointer(e: MouseEvent, selection: string): string | null {
  if (selection) {
    const p = asAbsolutePath(selection);
    if (p) return p;
  }

  const target = e.target as HTMLElement | null;

  const code = target?.closest("code");
  if (code && !code.closest("pre")) {
    const p = asAbsolutePath(code.textContent ?? "");
    if (p) return p;
  }

  const href = target?.closest("a")?.getAttribute("href");
  if (href) {
    const p = asAbsolutePath(href);
    if (p) return p;
  }

  const caret = caretAt(e.clientX, e.clientY);
  if (caret) {
    const text = caret.node.data;
    return delimitedAround(text, caret.offset) ?? tokenAround(text, caret.offset);
  }
  return null;
}
