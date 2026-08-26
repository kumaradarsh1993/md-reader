/**
 * Painting highlights with the CSS Custom Highlight API.
 *
 * ## Why not wrap the text in `<mark>`
 *
 * That is the obvious approach and it is the wrong one here, for a specific
 * reason: **two other features already split this DOM's text nodes.** The Find
 * bar wraps every match in a `<mark class="find-hit">`, and `postRender` injects
 * elements into code blocks. A third text-splitting painter would have to
 * interleave with both — clearing one while another holds split nodes leaves
 * fragments behind, and the failure mode is silent and cumulative.
 *
 * `CSS.highlights` paints ranges without touching the document at all. Nothing
 * to clear, nothing to collide with, and re-rendering the prose simply drops
 * the stale ranges on the floor.
 *
 * The one thing it gives up is hit-testing — a `::highlight()` pseudo-element
 * is not an element and receives no clicks. That is recovered with
 * `caretRangeFromPoint` on a plain click handler, which is a few lines, and
 * which is needed for clicking anywhere in a passage anyway.
 *
 * Requires Chromium 105+ / Safari 17.2+. WebView2 and WKWebView both qualify;
 * an older WebKitGTK does not, and there the highlights simply do not paint —
 * `supported()` reports that so the UI can say so rather than look broken.
 */

import { HIGHLIGHT_COLORS, type HighlightColor } from "./types";

const PREFIX = "foxmd-hl-";

export function supported(): boolean {
  return typeof CSS !== "undefined" && !!(CSS as any).highlights && typeof Highlight !== "undefined";
}

/**
 * Replace every painted highlight in one go.
 *
 * One registry per colour, plus one for "selected", because a `::highlight()`
 * rule styles a whole registry — per-range colours are not a thing. Six
 * registries is the entire cost of five colours.
 */
export function paintHighlights(
  groups: Map<HighlightColor, Range[]>,
  active: Range[],
): void {
  if (!supported()) return;
  const registry = (CSS as any).highlights as Map<string, unknown>;
  for (const color of HIGHLIGHT_COLORS) {
    const ranges = groups.get(color);
    const key = PREFIX + color;
    if (!ranges || ranges.length === 0) registry.delete(key);
    else registry.set(key, new Highlight(...ranges));
  }
  if (active.length === 0) registry.delete(PREFIX + "active");
  else registry.set(PREFIX + "active", new Highlight(...active));
}

export function clearHighlights(): void {
  if (!supported()) return;
  const registry = (CSS as any).highlights as Map<string, unknown>;
  for (const color of HIGHLIGHT_COLORS) registry.delete(PREFIX + color);
  registry.delete(PREFIX + "active");
}
