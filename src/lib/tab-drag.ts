/**
 * Geometry for dragging a tab along the strip.
 *
 * ## Why this is pointer-based and not HTML5 drag-and-drop
 *
 * It used to be HTML5 DnD, and reordering silently did nothing. The cause is
 * a Tauri-level conflict, not a bug in the handlers: `dragDropEnabled: true`
 * in `tauri.conf.json` installs an OS drop target on the window so the app can
 * receive real file drops (dropping a `.md` on the window opens it — see the
 * `onDragDropEvent` listener in `+page.svelte`). While that is installed, the
 * webview does not deliver HTML5 `dragover`/`drop` to the page at all.
 *
 * `dragstart` still fires, because it is a source-side event. So the old code
 * appeared half-alive in exactly the way that is hardest to diagnose: tear-out
 * worked — it keyed off `dropEffect === "none"`, which is what you get when
 * nothing accepts the drop — while reordering, which needed `drop` to fire, did
 * nothing at all. "I can pull a tab out but I can't move it left or right" is
 * the precise signature of this configuration.
 *
 * Turning `dragDropEnabled` off would have fixed reordering and broken opening
 * files by dropping them on the window. Pointer events cost nothing extra and
 * are what the browsers themselves use: they give live reflow as you drag,
 * which HTML5 DnD cannot do anyway.
 *
 * ## Coordinates
 *
 * Everything here is in **content space** — the coordinate system the strip's
 * children live in, which does not move when the strip scrolls. Callers pass
 * `dx` as pointer movement *plus* how far the strip has scrolled since the drag
 * began. That one addition is what makes edge auto-scroll work: the same number
 * describes both where the pointer went and where the tab should be drawn.
 *
 * Rects are captured once, at drag start, and stay valid for the whole drag
 * because nothing reflows — the dragged tab keeps its box in the layout and is
 * moved with a transform, and its neighbours are moved with transforms too.
 */

export interface TabRect {
  id: string;
  /** Left edge in content space. */
  left: number;
  width: number;
}

/**
 * Space between adjacent tabs, measured rather than hardcoded so it stays
 * correct if the strip's `gap` changes in CSS.
 */
export function gapOf(rects: TabRect[]): number {
  if (rects.length < 2) return 0;
  return Math.max(0, rects[1].left - (rects[0].left + rects[0].width));
}

/**
 * Where the dragged tab should land if the drag ended now.
 *
 * The rule is the one every tab strip uses: **you take a slot when you cross
 * its midpoint**, in the direction you are travelling. Moving right, the
 * dragged tab's right edge has to pass a neighbour's centre; moving left, its
 * left edge does.
 *
 * Using leading edges rather than the dragged tab's own centre is what gives
 * the gesture its hysteresis. A tab that has just swapped is sitting exactly
 * where the neighbour it displaced used to be, so a centre-vs-centre test sits
 * right on its own trigger point and flickers between two orderings on
 * sub-pixel pointer noise. With edges you must travel back most of a tab width
 * to undo a swap, which is what "it feels sticky in a good way" is made of.
 *
 * The loops `break` rather than `continue` so the result is monotonic in `dx`:
 * you cannot leapfrog a tab you have not passed yet, even when widths differ
 * wildly (a short "todo.md" next to a long filename).
 */
export function targetIndex(rects: TabRect[], from: number, dx: number): number {
  const me = rects[from];
  if (!me) return from;

  const left = me.left + dx;
  const right = left + me.width;
  let to = from;

  if (dx > 0) {
    for (let i = from + 1; i < rects.length; i++) {
      if (right > rects[i].left + rects[i].width / 2) to = i;
      else break;
    }
  } else if (dx < 0) {
    for (let i = from - 1; i >= 0; i--) {
      if (left < rects[i].left + rects[i].width / 2) to = i;
      else break;
    }
  }
  return to;
}

/**
 * How far tab `i` should slide to make room, while the drag is still running.
 *
 * The dragged tab vacates exactly `its width + one gap`, so every tab it has
 * passed moves by that much, in the opposite direction. Deriving the distance
 * from the dragged tab's own width — rather than from each neighbour's — is
 * what keeps the strip gapless when tabs have different widths.
 */
export function slideFor(
  rects: TabRect[],
  from: number,
  to: number,
  i: number,
  gap: number,
): number {
  if (i === from || to === from) return 0;
  const step = rects[from].width + gap;
  if (to > from && i > from && i <= to) return -step;
  if (to < from && i >= to && i < from) return step;
  return 0;
}

/**
 * The offset the dragged tab settles at when released — the sum of everything
 * it has to travel over to reach `to`.
 *
 * Animating to this value rather than snapping to 0 is what stops the tab from
 * jumping backwards for one frame on release: the DOM reorder happens after the
 * transform has already carried it to its new home.
 */
export function restingDx(
  rects: TabRect[],
  from: number,
  to: number,
  gap: number,
): number {
  if (to === from) return 0;
  let d = 0;
  if (to > from) {
    for (let i = from + 1; i <= to; i++) d += rects[i].width + gap;
    return d;
  }
  for (let i = to; i < from; i++) d += rects[i].width + gap;
  return -d;
}

/**
 * How far the strip should scroll this frame so a tab dragged against an edge
 * keeps moving, the way it does in a browser.
 *
 * Returns signed pixels, ramped by how deep into the edge zone the pointer is —
 * a flat rate makes the strip feel like it either ignores you or bolts. Zero
 * when there is nothing to scroll, so the caller can use it as its own "is
 * there anything to do" test.
 */
export function autoScrollStep(
  pointerX: number,
  stripLeft: number,
  stripWidth: number,
  scrollLeft: number,
  scrollWidth: number,
  zone = 28,
  maxStep = 14,
): number {
  const maxScroll = scrollWidth - stripWidth;
  if (maxScroll <= 0) return 0;

  const fromLeft = pointerX - stripLeft;
  const fromRight = stripLeft + stripWidth - pointerX;

  if (fromLeft < zone && scrollLeft > 0) {
    const depth = Math.min(1, (zone - fromLeft) / zone);
    return -Math.max(1, Math.round(maxStep * depth));
  }
  if (fromRight < zone && scrollLeft < maxScroll) {
    const depth = Math.min(1, (zone - fromRight) / zone);
    return Math.max(1, Math.round(maxStep * depth));
  }
  return 0;
}

/**
 * Whether the pointer has left the strip far enough vertically to mean "pull
 * this out into its own window".
 *
 * Vertical distance is the signal because horizontal movement is reordering —
 * the two gestures have to be separable without a modifier key, and this is how
 * every tabbed browser separates them. The threshold is deliberately more than
 * the strip's own height so that overshooting a reorder near the top of the
 * window cannot detach a tab by accident.
 */
export function isTearOut(
  pointerY: number,
  stripTop: number,
  stripBottom: number,
  threshold = 48,
): boolean {
  if (pointerY > stripBottom) return pointerY - stripBottom > threshold;
  if (pointerY < stripTop) return stripTop - pointerY > threshold;
  return false;
}
