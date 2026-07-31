/**
 * Markdown heading extraction for the Outline panel.
 *
 * Lives outside the component so the parser can be shared and tested
 * independently, and so the slug algorithm stays in lockstep with
 * `post-render.ts` (which assigns the ids the Outline links to).
 *
 * v0.6.0+.
 */

export interface Heading {
  /** 1–6. */
  level: number;
  /** Heading text with markdown inline syntax stripped. */
  text: string;
  /** Slug id, deduped exactly like post-render.ts assigns them. */
  id: string;
  /** 1-based source line the heading sits on. The shared coordinate with
   *  `data-sourcepos`, used for scroll-spy and jumps. */
  line: number;
  /** Index in document order. */
  index: number;
}

/**
 * GitHub's heading-slug algorithm.
 *
 * Must stay byte-identical to `slugify()` in post-render.ts — that one assigns
 * the DOM ids, this one predicts them, and a divergence silently breaks
 * outline navigation.
 *
 * Two deliberate changes in v0.7.0:
 *  - **The `h-` prefix is gone.** It made every hand-written table of contents
 *    dead on arrival: authors (and every AI that writes one) emit
 *    `[Vertical rhythm](#vertical-rhythm)` per GitHub convention, and the ids
 *    were `h-vertical-rhythm`, so no anchor in any document ever resolved.
 *  - **Unicode-aware.** `\w` is ASCII-only, so `## Résumé`, `## 概要` and
 *    `## 日本語` all reduced to the empty string and then collided with each
 *    other as `h-`, `h--1`, `h--2`.
 */
function baseSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
  // A heading of pure punctuation ("## ---") would otherwise produce an empty
  // id, which is not a valid anchor target.
  return slug || "section";
}

/**
 * Strip the inline markdown that would otherwise show up as literal noise in
 * the outline: emphasis markers, inline code ticks, link syntax, images and
 * trailing closing hashes of a closed ATX heading.
 */
function cleanHeadingText(raw: string): string {
  let t = raw.trim();
  t = t.replace(/\s+#+\s*$/, "");            // closed ATX: "## Title ##"
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1"); // images → alt text
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");  // links → label
  t = t.replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1"); // reference links → label
  t = t.replace(/`([^`]*)`/g, "$1");          // inline code
  t = t.replace(/(\*\*|__)(.*?)\1/g, "$2");   // bold
  t = t.replace(/(\*|_)(.*?)\1/g, "$2");      // italic
  t = t.replace(/~~(.*?)~~/g, "$1");          // strikethrough
  return t.trim();
}

/**
 * Parse headings out of markdown source.
 *
 * Handles both ATX (`## Title`) and setext (`Title` over `===` / `---`)
 * headings, and skips fenced code blocks so a `# comment` inside a shell
 * snippet doesn't end up in the outline. Recognising setext matters for more
 * than tidiness: the renderer emits them as real `<h1>`/`<h2>` elements, so a
 * parser that missed them would desynchronise the outline from the document.
 */
export function parseHeadings(source: string): Heading[] {
  const out: Heading[] = [];
  const lines = source.split(/\r?\n/);
  const seen = new Map<string, number>();
  let fence: string | null = null;

  const push = (level: number, raw: string, line: number) => {
    const text = cleanHeadingText(raw);
    if (!text) return;
    const base = baseSlug(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({
      level,
      text,
      id: n === 0 ? base : `${base}-${n}`,
      line,
      index: out.length,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks: ``` or ~~~, closed only by a fence of the same kind.
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const atx = /^\s{0,3}(#{1,6})(\s+.*|)$/.exec(line);
    if (atx) {
      push(atx[1].length, atx[2], i + 1);
      continue;
    }

    // Setext: the underline belongs to the *previous* line, which must be a
    // non-blank paragraph line that wasn't already consumed as a heading.
    const setext = /^\s{0,3}(=+|-{2,})\s*$/.exec(line);
    if (setext && i > 0) {
      const prev = lines[i - 1];
      const prevIsText = prev.trim() !== "" && !/^\s{0,3}#{1,6}(\s|$)/.test(prev);
      const alreadyTaken = out.length > 0 && out[out.length - 1].line === i;
      if (prevIsText && !alreadyTaken) {
        push(setext[1][0] === "=" ? 1 : 2, prev, i);
      }
    }
  }

  return out;
}

/**
 * Given a heading list and the source line currently at the top of the
 * viewport, return the index of the heading whose section contains it, or -1
 * when the reader is above the first heading.
 */
export function activeHeadingIndex(headings: Heading[], topLine: number | null): number {
  if (topLine === null) return -1;
  let idx = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].line <= topLine) idx = i;
    else break;
  }
  return idx;
}
