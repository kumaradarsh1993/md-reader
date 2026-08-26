<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { api } from "./api";
  import {
    settings,
    effectiveDark,
    effectiveThemeName,
    bumpZoom,
    bumpWidth,
    type ScrollMark,
  } from "./settings-store.svelte";
  import { readingMetrics } from "./reading-metrics.svelte";
  import { annotations, defaultAuthor } from "./annotations/store.svelte";
  import { anchorFromSelection, indexBlocks, offsetAtPoint, resolveAnchor, type BlockText } from "./annotations/anchor";
  import { clearHighlights, paintHighlights } from "./annotations/paint";
  import CommentLane from "./annotations/CommentLane.svelte";
  import SelectionToolbar from "./annotations/SelectionToolbar.svelte";
  import type { Anchor, HighlightColor, Placed } from "./annotations/types";
  import { contextMenu, type MenuEntry } from "./context-menu.svelte";
  import { sk, copyText } from "./platform";
  import { postRender } from "./post-render";
  import { viewNav } from "./view-nav.svelte";
  import ResumeMarker from "./ResumeMarker.svelte";

  type Mode = "view" | "edit" | "split";

  interface Props {
    source: string;
    basePath: string;
    mode?: Mode;
    lastChangeFromDisk?: number;
    /** Identity of the tab being displayed. The Viewer is a single long-lived
     *  instance shared by every tab, so this is what tells it "different
     *  document now" — without it, tab A's scroll position bleeds into tab B. */
    tabId?: string;
    /** Looks up where a tab was last scrolled to. Deliberately a callback
     *  rather than a plain prop: the Viewer *writes* this value on every
     *  scroll, and a reactive read would feed that write straight back into
     *  the render effect. */
    getScrollMark?: (tabId: string) => ScrollMark | null;
    /** Position carried over from a previous session — anchors the marker. */
    resumeMark?: ScrollMark | null;
    /** User has dismissed the marker for this tab. */
    resumeDismissed?: boolean;
    /** The cross-session position has already been applied once for this tab,
     *  so a remount (edit ↔ view, theme change) shouldn't re-announce it. */
    resumeApplied?: boolean;
    /** Reports the reading position as it changes (throttled). */
    onScrollMark?: (tabId: string, mark: ScrollMark) => void;
    /** Fired once the cross-session position has been applied. */
    onResumeApplied?: (tabId: string) => void;
    /** User dismissed the marker, or scrolled a full screen past it. */
    onDismissResume?: (tabId: string) => void;
    /** Source content the diff-mode baseline compares against. */
    baselineSource?: string;
    /** Theatre yellow-highlight ranges (1-based line numbers in the
     *  current source). Painted whenever the prop is non-empty. v0.4.0+. */
    theatreHighlightRanges?: Array<{ from: number; to: number }>;
    /** Theatre green-highlight ranges — line ranges touched in the last
     *  ~1.5s of the current turn. Painted on top of stale ranges with
     *  mutual exclusion (an element matching both renders as fresh/green).
     *  v0.5.0+. */
    theatreFreshRanges?: Array<{ from: number; to: number }>;
    /** A relative markdown link was clicked — open that file as a tab. */
    onOpenRelative?: (path: string) => void;
    /** Context menu asked to search for the current selection. */
    onFindSelection?: (text: string) => void;
    /** Context menu asked to re-read the file from disk. */
    onReloadRequest?: () => void;
  }
  let {
    source = "",
    basePath = "",
    onOpenRelative,
    onFindSelection,
    onReloadRequest,
    mode = "view",
    lastChangeFromDisk = 0,
    baselineSource = "",
    theatreHighlightRanges = [],
    theatreFreshRanges = [],
    tabId = "",
    getScrollMark,
    resumeMark = null,
    resumeDismissed = false,
    resumeApplied = false,
    onScrollMark,
    onResumeApplied,
    onDismissResume,
  }: Props = $props();

  let container: HTMLDivElement;
  let html = $state("");
  let lastScroll = 0;
  let prevSource = "";
  let prevDiskTick = 0;
  /** Tab whose content is currently painted. Compared against the `tabId` prop
   *  to tell a document swap apart from a mere re-render. */
  let renderedTabId = "";

  let dark = $derived(effectiveDark(settings.s.theme));
  let themeName = $derived(effectiveThemeName(settings.s.theme));

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Find the first 1-indexed line where two markdown sources diverge.
   * Returns null if identical or both empty.
   */
  function firstChangedLine(oldSrc: string, newSrc: string): number | null {
    if (oldSrc === newSrc) return null;
    const oldLines = oldSrc.split("\n");
    const newLines = newSrc.split("\n");
    const min = Math.min(oldLines.length, newLines.length);
    for (let i = 0; i < min; i++) {
      if (oldLines[i] !== newLines[i]) return i + 1;
    }
    return min + 1; // appended past end
  }

  /** Find the deepest element whose data-sourcepos range covers `line`. */
  function findElementByLine(root: HTMLElement, line: number): HTMLElement | null {
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-sourcepos]"));
    let best: HTMLElement | null = null;
    let bestRange = Infinity;
    for (const el of els) {
      const sp = el.dataset.sourcepos;
      if (!sp) continue;
      const m = /^(\d+):\d+-(\d+):\d+$/.exec(sp);
      if (!m) continue;
      const from = +m[1];
      const to = +m[2];
      if (line >= from && line <= to) {
        const range = to - from;
        if (range < bestRange) {
          best = el;
          bestRange = range;
        }
      }
    }
    return best;
  }

  // ═══ Reading position: per-tab memory, scroll-spy, resume marker ══════
  //
  // One Viewer instance serves every tab, so all of this keys off `tabId`.
  // The invariants that matter:
  //   · a scroll event must never be attributed to a tab other than the one
  //     that was on screen when it fired;
  //   · a programmatic scroll (restore / jump / live-follow) must not be
  //     mistaken for the reader moving, or it would overwrite the very mark
  //     it just restored.

  /** Top-level blocks with their source-line ranges, rebuilt after each
   *  render so scroll handling is a cheap array walk rather than a DOM query.
   *
   *  `top`/`bottom` are **content-space** offsets (px from the top of the
   *  scrollable content), cached at build time. This is the whole reason
   *  scrolling is smooth: see `blocksAbove`. */
  let lineIndex: Array<{ el: HTMLElement; from: number; to: number; top: number; bottom: number }> = [];
  /** Same, restricted to headings — drives the outline's active-section mark. */
  let headingIndex: Array<{ el: HTMLElement; line: number; top: number }> = [];
  /** Geometry has changed under us (font size, width, image load, mermaid) and
   *  the cached offsets must be re-measured before the next probe. */
  let geometryDirty = true;
  let geometryObserver: ResizeObserver | null = null;
  /** The scroll container's viewport box, cached alongside the block offsets.
   *  It cannot change while scrolling, only when the window or the surrounding
   *  chrome resizes — which is what invalidates the whole geometry cache. */
  let containerBox = { top: 0, bottom: 0, right: 0 };
  let chProbe: HTMLSpanElement | undefined;

  /** Set while we're moving the scroll position ourselves. */
  let programmaticScroll = false;
  let programmaticTimer: ReturnType<typeof setTimeout> | null = null;
  let navRaf = 0;
  let markTimer: ReturnType<typeof setTimeout> | null = null;
  /** The tab a pending mark write belongs to. */
  let pendingMarkTabId = "";
  let pendingMark: ScrollMark | null = null;

  // Resume-marker geometry, recomputed on scroll / render. All viewport
  // coordinates: the marker is position:fixed in the right margin, so unlike
  // the old ribbon it never participates in the scrolled content's layout.
  let markerY = $state(0);
  let markerRight = $state(16);
  let markerState = $state<"above" | "in-view" | "below">("in-view");
  let markerResolved = $state(false);
  /** True for a few seconds after a resume, so the marker can announce itself. */
  let markerFresh = $state(false);
  let freshTimer: ReturnType<typeof setTimeout> | null = null;

  let markerVisible = $derived(
    settings.s.resumeRibbon &&
      settings.s.rememberScroll &&
      !!resumeMark &&
      !resumeDismissed &&
      markerResolved &&
      mode === "view",
  );

  function parseSourcepos(el: HTMLElement): { from: number; to: number } | null {
    const sp = el.dataset.sourcepos;
    if (!sp) return null;
    const m = /^(\d+):\d+-(\d+):\d+$/.exec(sp);
    if (!m) return null;
    return { from: +m[1], to: +m[2] };
  }

  function buildIndexes() {
    lineIndex = [];
    headingIndex = [];
    if (!container) return;
    const prose = container.querySelector<HTMLElement>(".prose");
    if (!prose) return;
    for (const el of Array.from(prose.children) as HTMLElement[]) {
      const range = parseSourcepos(el);
      if (!range) continue;
      lineIndex.push({ el, from: range.from, to: range.to, top: 0, bottom: 0 });
      if (/^H[1-6]$/.test(el.tagName)) headingIndex.push({ el, line: range.from, top: 0 });
    }
    geometryDirty = true;
  }

  /**
   * Re-measure every indexed block's content-space offset.
   *
   * `.viewer` is `position: relative`, so it is each block's `offsetParent`
   * and `offsetTop` is already the distance from the top of the scrollable
   * content — scroll-independent, so it only has to be read when the *layout*
   * changes, never while scrolling.
   */
  function measureGeometry() {
    if (!container) return;
    const c = container.getBoundingClientRect();
    containerBox = { top: c.top, bottom: c.bottom, right: c.right };

    // Publish the reading column's real dimensions so the width controls can
    // offer a ceiling that matches this monitor instead of a constant.
    const prose = container.querySelector<HTMLElement>(".prose");
    if (chProbe && prose) {
      const cs = getComputedStyle(prose);
      const gutters = parseFloat(cs.paddingLeft || "0") + parseFloat(cs.paddingRight || "0");
      // The viewer's own padding is the reserved comment lane. It is not space
      // the text may use, so the ceiling must not offer it.
      const vs = getComputedStyle(container);
      const reserved = parseFloat(vs.paddingLeft || "0") + parseFloat(vs.paddingRight || "0");
      readingMetrics.publish(
        chProbe.getBoundingClientRect().width / 20,
        container.clientWidth - reserved - gutters,
      );
    }
    for (const b of lineIndex) {
      b.top = b.el.offsetTop;
      b.bottom = b.top + b.el.offsetHeight;
    }
    for (const h of headingIndex) h.top = h.el.offsetTop;
    geometryDirty = false;
  }

  function ensureGeometry() {
    if (geometryDirty) measureGeometry();
  }

  /**
   * The last indexed block starting at or above `contentY` (px from the top of
   * the scrollable content), and the last heading at or above it. Both are
   * needed: the outline highlights by heading, but the position we remember
   * should be the exact block being read.
   *
   * **Why this is a binary search over cached numbers and must stay that way.**
   * Until v0.10 this walked the block list calling `getBoundingClientRect()`
   * on each element until one passed the probe — and it ran *twice* per scroll
   * frame (once for the reading line, once for the resume mark), plus more
   * rects in `updateMarkerGeometry`. Every one of those is a forced synchronous
   * layout. Near the bottom of a long document that is thousands of layout
   * flushes per frame, which is exactly what the "rattly, unpolished scrolling"
   * complaint was. Offsets are now measured once per layout change and every
   * scroll frame is pure arithmetic.
   */
  function blocksAbove(contentY: number): { block: number | null; heading: number | null } {
    if (!container || lineIndex.length === 0) return { block: null, heading: null };
    ensureGeometry();

    let lo = 0;
    let hi = lineIndex.length - 1;
    let blockIdx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lineIndex[mid].top <= contentY) {
        blockIdx = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }

    let heading: number | null = null;
    lo = 0;
    hi = headingIndex.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (headingIndex[mid].top <= contentY) {
        heading = headingIndex[mid].line;
        lo = mid + 1;
      } else hi = mid - 1;
    }

    return { block: lineIndex[blockIdx].from, heading };
  }

  /** What sits at the very top of the viewport. This is the *resume* position:
   *  a mark is restored with `scrollBlockToTop`, so it has to name the block
   *  that was at the top, not the one that was being read. */
  function topOfViewport(): { block: number | null; heading: number | null } {
    if (!container) return { block: null, heading: null };
    return blocksAbove(container.scrollTop + 12);
  }

  /**
   * Where the *reading line* sits inside the viewport, as a fraction of its
   * height. This is what the outline highlights against, and it is deliberately
   * not the top edge.
   *
   * Anchoring the outline to the top edge (v0.6–v0.7) made the last section of
   * a document unreachable: with three sections on screen only the top one ever
   * lit up, and scrolling to the very bottom still highlighted whatever had
   * come to rest against the top border. The reader's eye is not at the top
   * edge — it is around the middle.
   *
   * So: **the middle of the screen for the whole interior of the document**,
   * ramping to the true top within the first half-screen of scrolling and to
   * the true bottom within the last. The ramps are what make the ends behave —
   * the first section is active when you open a file, the last is active when
   * you hit the bottom — and being a ramp rather than a snap, the highlight
   * never jumps a section for a one-pixel scroll. Documents shorter than two
   * screens simply have shorter ramps and no flat middle.
   */
  function readingFraction(): number {
    if (!container) return 0;
    const view = container.clientHeight;
    const span = container.scrollHeight - view; // total scrollable distance
    if (view <= 0 || span <= 0) return 0;
    const top = Math.min(Math.max(container.scrollTop, 0), span);
    const ramp = Math.min(view, span) / 2;
    if (ramp <= 0) return 0.5;
    if (top < ramp) return 0.5 * (top / ramp);
    if (span - top < ramp) return 1 - 0.5 * ((span - top) / ramp);
    return 0.5;
  }

  function currentMark(): ScrollMark | null {
    if (!container) return null;
    const height = container.scrollHeight;
    const { block } = topOfViewport();
    return {
      line: block ?? 1,
      // Clamped at capture, not just at restore. macOS rubber-band scrolling
      // reports a *negative* `scrollTop` past the top of the document and one
      // beyond the maximum past the bottom. An unclamped negative ratio got
      // persisted and then floored to 0 on the way back in — so letting go of
      // a trackpad at the top of a document quietly reset "resume where you
      // left off" to the very beginning. Windows never showed this because
      // WebView2 has no elastic overscroll.
      ratio: height > 0 ? Math.min(1, Math.max(0, container.scrollTop / height)) : 0,
      at: Date.now(),
    };
  }

  /** Resolve a source line to the block that contains it, preferring an exact
   *  start-line match so a remembered heading lands on that heading. */
  function blockForLine(line: number): HTMLElement | null {
    let covering: HTMLElement | null = null;
    for (const b of lineIndex) {
      if (b.from === line) return b.el;
      if (line >= b.from && line <= b.to) covering = b.el;
      if (b.from > line) break;
    }
    return covering ?? findElementByLine(container, line);
  }

  function beginProgrammaticScroll() {
    programmaticScroll = true;
    if (programmaticTimer) clearTimeout(programmaticTimer);
    // Long enough to cover a smooth-scroll animation; the flag only suppresses
    // *writes*, so erring generous costs nothing but a stale mark for a moment.
    programmaticTimer = setTimeout(() => {
      programmaticScroll = false;
      programmaticTimer = null;
    }, 700);
  }

  /** Align a block's top with the top of the viewport (minus a little air). */
  function scrollBlockToTop(el: HTMLElement, smooth: boolean) {
    if (!container) return;
    ensureGeometry();
    beginProgrammaticScroll();
    container.scrollTo({
      // `.viewer` is the offsetParent, so offsetTop *is* the content-space
      // target — no rect subtraction, and no forced layout.
      top: Math.max(0, el.offsetTop - 12),
      behavior: smooth && !reduceMotion ? "smooth" : "auto",
    });
  }

  /** Restore a remembered position. The anchor line is tried first because it
   *  survives font-size, content-width and zoom changes; the height ratio is
   *  the fallback for when the block it named is gone. */
  function applyMark(mark: ScrollMark, smooth = false) {
    if (!container) return;
    const el = mark.line > 1 ? blockForLine(mark.line) : null;
    if (el) {
      scrollBlockToTop(el, smooth);
      return;
    }
    beginProgrammaticScroll();
    container.scrollTop = Math.max(0, mark.ratio * container.scrollHeight);
  }

  /** How far past the mark the reader has to travel before it retires itself. */
  const RESUME_RETIRE_SCREENS = 1;

  function updateMarkerGeometry() {
    if (!container || !resumeMark) {
      markerResolved = false;
      return;
    }
    const el = blockForLine(resumeMark.line);
    if (!el) {
      markerResolved = false;
      return;
    }
    ensureGeometry();
    // Content-space offsets converted to viewport coordinates by hand. Reading
    // two more rects here would put the per-frame layout flush straight back.
    const scrolled = container.scrollTop;
    const c = { top: containerBox.top, bottom: containerBox.bottom, right: containerBox.right };
    const elTop = el.offsetTop - scrolled + c.top;
    const r = { top: elTop, bottom: elTop + el.offsetHeight };
    markerResolved = true;
    // Above / below decide the chevron, which is the only thing that tells the
    // reader which way to scroll to get back.
    markerState = r.top < c.top + 4 ? "above" : r.top > c.bottom - 4 ? "below" : "in-view";
    // Track the anchor while it is on screen; pin to the nearer edge when not,
    // so the mark is always reachable without ever leaving the right margin.
    const pad = 26;
    markerY = Math.min(Math.max(r.top, c.top + pad), c.bottom - pad);
    markerRight = Math.max(8, window.innerWidth - c.right + 14);

    // Retire itself once the reader is a full screen past it. At that point
    // they have plainly resumed, and a bookmark for a place you have already
    // read past is just something else to dismiss by hand.
    if (
      !resumeDismissed &&
      tabId &&
      c.top - r.bottom > container.clientHeight * RESUME_RETIRE_SCREENS
    ) {
      onDismissResume?.(tabId);
    }
  }

  function publishNav() {
    if (!container) return;
    const view = container.clientHeight;
    const fraction = readingFraction();
    const { block, heading } = blocksAbove(container.scrollTop + fraction * view);
    // The rail measures the same reading line against the whole document, so
    // "how far the bar has filled" and "which entry is lit" can never disagree.
    // It still reads 0 at the top and exactly 1 at the bottom, because the
    // reading line itself ends up at the document's last pixel there.
    const docHeight = container.scrollHeight;
    const readY = container.scrollTop + fraction * view;
    const progress = docHeight > 0 ? Math.min(1, Math.max(0, readY / docHeight)) : 0;
    viewNav.publish(heading, block, progress);
  }

  function onScroll() {
    if (navRaf) return;
    navRaf = requestAnimationFrame(() => {
      navRaf = 0;
      publishNav();
      updateMarkerGeometry();
      if (programmaticScroll) return;
      // Per-tab retention is unconditional — it's simply correct behaviour.
      // The `rememberScroll` setting governs only whether the mark is written
      // to disk for the next session, which tabs-store handles.
      const mark = currentMark();
      if (!mark || !tabId) return;
      pendingMark = mark;
      pendingMarkTabId = tabId;
      if (markTimer) clearTimeout(markTimer);
      markTimer = setTimeout(flushMark, 220);
    });
  }

  function flushMark() {
    if (markTimer) clearTimeout(markTimer);
    markTimer = null;
    if (pendingMark && pendingMarkTabId) onScrollMark?.(pendingMarkTabId, pendingMark);
    pendingMark = null;
    pendingMarkTabId = "";
  }

  // ─── Ctrl+wheel = text size, Alt+wheel = characters per line ──────────
  //
  // Both are wired to an *accumulator* rather than one step per event. A mouse
  // notch arrives as a single 100-unit delta while a trackpad emits a stream of
  // 2–10 unit ones; stepping per event makes the mouse sluggish and the
  // trackpad uncontrollable. Accumulating distance travelled makes them agree.
  //
  // On macOS a trackpad pinch is reported as a wheel event with `ctrlKey` set,
  // so pinch-to-zoom comes free from the Ctrl branch.
  const WHEEL_STEP = 90;
  let wheelAccum = 0;
  let wheelKind: "" | "zoom" | "width" = "";

  function onModifiedWheel(e: WheelEvent) {
    const zoomMod = e.ctrlKey || e.metaKey;
    const widthMod = e.altKey && !zoomMod;
    if (!zoomMod && !widthMod) {
      wheelAccum = 0;
      wheelKind = "";
      return; // ordinary scrolling — leave it entirely alone
    }
    e.preventDefault();

    const kind: "zoom" | "width" = zoomMod ? "zoom" : "width";
    if (kind !== wheelKind) {
      wheelAccum = 0;
      wheelKind = kind;
    }

    // Normalise the three deltaModes to pixels so a "line" or "page" wheel
    // (some Windows mice, and Firefox) travels the same distance as a pixel one.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? container.clientHeight : 1;
    wheelAccum += e.deltaY * unit;

    while (Math.abs(wheelAccum) >= WHEEL_STEP) {
      const sign = wheelAccum > 0 ? 1 : -1;
      wheelAccum -= sign * WHEEL_STEP;
      // deltaY > 0 is "scroll down", which means smaller / narrower.
      const dir = -sign;
      if (kind === "zoom") bumpZoom(dir * 0.1);
      else bumpWidth(dir * 4);
    }
  }

  // ─── Annotations ──────────────────────────────────────────────────────

  let placed = $state<Placed[]>([]);
  let selRect = $state<{ top: number; bottom: number; left: number; right: number } | null>(null);
  let author = $state("Me");
  let paneWidth = $state(1200);
  let annotationsReady = $state(false);
  /** Anchors re-found this pass, written back outside the effect. See below. */
  let repairQueue: Array<{ id: string; anchor: Anchor }> = [];
  let repairTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * The lane appears for threads that exist *or* for the one being started.
   *
   * The `expandedId` half is not a nicety: "Comment" on a selection creates a
   * highlight with an empty thread and opens its composer, so a lane gated on
   * `thread.length > 0` would never show the box the comment is typed into —
   * the button would look broken every first time.
   */
  let laneOn = $derived(
    settings.s.showComments &&
      mode === "view" &&
      placed.some((p) => p.ann.thread.length > 0 || annotations.expandedId === p.ann.id),
  );

  $effect(() => {
    void (async () => {
      author = settings.s.authorName || (await defaultAuthor());
    })();
  });

  /**
   * Re-resolve every annotation against the DOM as it stands now, repaint, and
   * republish the lane positions.
   *
   * Called after each render, after each annotation change, and whenever the
   * cached block geometry is invalidated. It is O(annotations × blocks) in the
   * worst case — but only annotations whose cheap path failed reach the scan,
   * and the block text is indexed once per call rather than once per annotation.
   */
  function refreshAnnotations() {
    if (!container) return;
    const prose = container.querySelector<HTMLElement>(".prose");
    if (!prose || mode !== "view") {
      placed = [];
      clearHighlights();
      return;
    }
    ensureGeometry();

    const blocks: BlockText[] = indexBlocks(prose);
    const next: Placed[] = [];
    const detached: string[] = [];
    const groups = new Map<HighlightColor, Range[]>();
    const active: Range[] = [];
    const scrolled = container.scrollTop;
    const top0 = containerBox.top;

    for (const ann of annotations.annotations) {
      const hit = resolveAnchor(blocks, ann.anchor);
      if (!hit) {
        detached.push(ann.id);
        continue;
      }
      // Persist a repair so the next open takes the cheap path and the sidecar
      // keeps pointing at the passage rather than at where it used to be.
      //
      // **Queued, never written here.** This function runs inside an `$effect`
      // that reads `annotations.annotations`, and `updateAnchor` replaces that
      // array — a synchronous write would be an effect feeding its own input.
      // Svelte 5 reports `effect_update_depth_exceeded` once, to the console,
      // then aborts the component, at which point *every* handler in the app
      // silently stops responding. The flush below is deliberately asynchronous
      // so the write lands in a new effect turn, where the now-correct anchor
      // takes the cheap path and queues nothing.
      if (hit.repaired) repairQueue.push({ id: ann.id, anchor: hit.anchor });

      const r = hit.range.getBoundingClientRect();
      next.push({
        ann,
        top: r.top - top0 + scrolled,
        bottom: r.bottom - top0 + scrolled,
        range: hit.range,
      });

      if (settings.s.showHighlights) {
        if (annotations.expandedId === ann.id) active.push(hit.range);
        else {
          const list = groups.get(ann.color) ?? [];
          list.push(hit.range);
          groups.set(ann.color, list);
        }
      }
    }

    if (repairQueue.length > 0 && !repairTimer) {
      repairTimer = setTimeout(() => {
        repairTimer = null;
        const batch = repairQueue;
        repairQueue = [];
        for (const r of batch) annotations.updateAnchor(r.id, r.anchor);
      }, 0);
    }

    annotations.setDetached(detached);
    placed = next;
    if (settings.s.showHighlights) paintHighlights(groups, active);
    else clearHighlights();
    paneWidth = container.clientWidth;
    annotationsReady = true;
  }

  /** Repaint whenever the model or the layers change. Reads the store's array
   *  identity, which every mutation replaces, so this is the single trigger. */
  $effect(() => {
    void annotations.annotations;
    void annotations.expandedId;
    void settings.s.showHighlights;
    void settings.s.showComments;
    void mode;
    if (renderedTabId) refreshAnnotations();
  });

  /** A new selection inside the prose raises the annotate toolbar. */
  function updateSelection() {
    if (mode !== "view") { selRect = null; return; }
    const sel = window.getSelection();
    const prose = container?.querySelector<HTMLElement>(".prose");
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !prose) { selRect = null; return; }
    const range = sel.getRangeAt(0);
    if (!prose.contains(range.commonAncestorContainer)) { selRect = null; return; }
    const r = range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { selRect = null; return; }
    selRect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }

  function currentAnchor(): Anchor | null {
    const sel = window.getSelection();
    const prose = container?.querySelector<HTMLElement>(".prose");
    if (!sel || !prose) return null;
    return anchorFromSelection(prose, sel);
  }

  function highlightSelection(color: HighlightColor) {
    const anchor = currentAnchor();
    if (!anchor) return;
    annotations.addHighlight(anchor, color);
    window.getSelection()?.removeAllRanges();
    selRect = null;
  }

  function commentOnSelection() {
    const anchor = currentAnchor();
    if (!anchor) return;
    // Created as a bare highlight and immediately expanded, so the composer in
    // the margin is where the comment is written — one place to type a note,
    // whether it is the first or the fifth.
    const ann = annotations.addHighlight(anchor, settings.s.defaultHighlightColor);
    if (!settings.s.showComments) settings.set("showComments", true);
    annotations.expandedId = ann.id;
    window.getSelection()?.removeAllRanges();
    selRect = null;
  }

  function copySelection() {
    const text = window.getSelection()?.toString() ?? "";
    if (text) void copyText(text);
    selRect = null;
  }

  /** Bring an annotation's passage into view, roughly a third down the screen —
   *  high enough to read what follows, low enough to see what preceded it. */
  function goToAnnotation(id: string) {
    const p = placed.find((x) => x.ann.id === id);
    if (!p || !container) return;
    beginProgrammaticScroll();
    container.scrollTo({
      top: Math.max(0, p.top - container.clientHeight / 3),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  /** Clicking highlighted text opens its thread. `::highlight()` is not
   *  hit-testable, so the hit is recovered from the caret position. */
  function annotationAtPoint(x: number, y: number): string | null {
    const prose = container?.querySelector<HTMLElement>(".prose");
    if (!prose || annotations.annotations.length === 0) return null;
    const hit = offsetAtPoint(indexBlocks(prose), x, y);
    if (!hit) return null;
    for (const ann of annotations.annotations) {
      const a = ann.anchor;
      if (a.blockLine === hit.line && hit.at >= a.start && hit.at < a.start + a.length) return ann.id;
    }
    return null;
  }

  /** Outline entries call in through the view-nav store. */
  const unregisterScroller = viewNav.registerScroller((line, opts) => {
    const el = blockForLine(line);
    if (el) scrollBlockToTop(el, opts?.smooth ?? true);
  });

  function jumpToResume() {
    if (resumeMark) applyMark(resumeMark, true);
  }

  function dismissMarker() {
    if (tabId) onDismissResume?.(tabId);
  }

  /**
   * Anything that can change layout without changing the markdown — window
   * resize, side-panel collapse, font size, content width, an image finally
   * decoding — invalidates the cached offsets. Marking them dirty is all that
   * happens here; the re-measure is deferred to the next probe, so a drag of
   * the panel splitter costs one measurement, not one per pixel.
   */
  $effect(() => {
    if (!container) return;
    // A layout change moves the text, so it moves every highlight and every
    // card with it. Coalesced into one frame: dragging the panel splitter
    // fires the observer continuously.
    let reflowRaf = 0;
    const invalidate = () => {
      geometryDirty = true;
      if (reflowRaf) return;
      reflowRaf = requestAnimationFrame(() => {
        reflowRaf = 0;
        refreshAnnotations();
      });
    };
    const ro = new ResizeObserver(invalidate);
    ro.observe(container);
    const prose = container.querySelector(".prose");
    if (prose) ro.observe(prose);
    geometryObserver = ro;
    window.addEventListener("resize", invalidate);
    // Registered by hand, not as `onwheel`, because the handler has to be able
    // to `preventDefault()`: Ctrl+wheel is the browser's own page-zoom gesture
    // and a passive listener cannot stop it.
    container.addEventListener("wheel", onModifiedWheel, { passive: false });
    // `selectionchange` fires on the document, which is the only event that
    // catches every way a selection is made: drag, double-click, Shift+arrow,
    // and Ctrl+A. Read one frame later so the browser has finalised the range.
    let selRaf = 0;
    const onSelectionChange = () => {
      if (selRaf) cancelAnimationFrame(selRaf);
      selRaf = requestAnimationFrame(() => { selRaf = 0; updateSelection(); });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      ro.disconnect();
      geometryObserver = null;
      if (reflowRaf) cancelAnimationFrame(reflowRaf);
      if (selRaf) cancelAnimationFrame(selRaf);
      window.removeEventListener("resize", invalidate);
      document.removeEventListener("selectionchange", onSelectionChange);
      container?.removeEventListener("wheel", onModifiedWheel);
    };
  });

  /** Anything that changes type metrics without changing the markdown. */
  $effect(() => {
    void settings.s.fontSize;
    void settings.s.zoom;
    void settings.s.fontFamily;
    void settings.s.contentWidthCh;
    void settings.s.fullWidth;
    geometryDirty = true;
  });

  onDestroy(() => {
    unregisterScroller();
    flushMark();
    if (navRaf) cancelAnimationFrame(navRaf);
    if (programmaticTimer) clearTimeout(programmaticTimer);
    if (freshTimer) clearTimeout(freshTimer);
    if (repairTimer) clearTimeout(repairTimer);
    clearHighlights();
    viewNav.reset();
  });

  $effect(() => {
    const src = source;
    const isDark = dark;
    // Read inside the tracked scope so a theme switch re-renders: the syntax
    // palette is chosen in Rust from this exact string.
    const paletteName = themeName;
    const diskTick = lastChangeFromDisk;
    const currentMode = mode;
    const baseline = baselineSource;
    const diffOn = settings.s.diffMode;
    // Read synchronously so a tab switch re-runs this effect even when the two
    // tabs happen to hold byte-identical content.
    const tab = tabId;
    let cancelled = false;

    // Compute change line BEFORE re-render, while we still have the old source on screen.
    const isDiskChange = diskTick !== prevDiskTick;
    const changedLine = isDiskChange ? firstChangedLine(prevSource, src) : null;

    const isTabSwitch = tab !== renderedTabId;
    // The outgoing tab's position must land before the incoming tab's is read,
    // or a quick Ctrl+Tab loses the last few hundred pixels of scrolling.
    if (isTabSwitch) {
      flushMark();
      viewNav.reset();
    }

    (async () => {
      const rendered = await api.renderMarkdown(src, paletteName);
      if (cancelled) return;
      lastScroll = container?.scrollTop ?? 0;
      // Everything below is read post-await, i.e. outside the reactive
      // tracking scope, so writing these values back can't retrigger a render.
      const markToRestore = isTabSwitch ? getScrollMark?.(tab) ?? null : null;
      const resumeToAnnounce = isTabSwitch ? resumeMark : null;
      html = rendered;
      renderedTabId = tab;
      await tick();
      if (container) {
        buildIndexes();
        if (isTabSwitch) {
          // A switch must always place the scroll deliberately. Falling through
          // to `lastScroll` here would hand the incoming tab the *outgoing*
          // tab's offset — the original complaint — so an unvisited document
          // explicitly starts at the top.
          beginProgrammaticScroll();
          if (markToRestore) applyMark(markToRestore);
          else container.scrollTop = 0;
        } else {
          beginProgrammaticScroll();
          container.scrollTop = lastScroll;
        }
        await postRender(container, { dark: isDark });
        rewriteRelativeImages(container, basePath);
        // postRender assigns heading ids and lays out math/diagrams, any of
        // which can shift block heights. Re-anchor so a restore lands on the
        // line it named rather than where that line used to be.
        buildIndexes();
        if (isTabSwitch && markToRestore) applyMark(markToRestore);

        if (resumeToAnnounce && !resumeApplied && !resumeDismissed && settings.s.resumeRibbon) {
          markerFresh = true;
          if (freshTimer) clearTimeout(freshTimer);
          freshTimer = setTimeout(() => { markerFresh = false; }, 5200);
          if (tab) onResumeApplied?.(tab);
        }
        updateMarkerGeometry();
        publishNav();
        // After postRender, not before: heading ids, math and diagrams all
        // change block text and heights, and an anchor resolved against the
        // pre-postRender DOM would be painted in the wrong place.
        refreshAnnotations();

        // Live-follow: smart-scroll + flash for the most recent disk edit.
        if (isDiskChange && changedLine != null && currentMode === "view") {
          maybeFollowToLine(changedLine);
        }

        // Diff mode: paint every line that differs from the baseline. This is
        // cumulative — every change since the baseline was set lights up,
        // unlike live-track which only shows the most recent edit briefly.
        if (diffOn) {
          applyDiffHighlight(container, baseline, src);
        } else {
          clearDiffHighlight(container);
        }

        // Theatre highlights — yellow for stale (this turn but not in the
        // last ~1.5s), green for fresh (currently being edited). Independent
        // of diff-mode. Mutual exclusion: fresh wins when both match.
        applyTheatreHighlight(container, theatreHighlightRanges, theatreFreshRanges);
      }
      prevSource = src;
      prevDiskTick = diskTick;
    })();
    return () => {
      cancelled = true;
    };
  });

  /** Set of 1-indexed line numbers in `current` whose text isn't present
   *  anywhere in `baseline`. Naive but cheap and effective for AI-edit cases:
   *  added or modified lines stand out; "moved" lines aren't flagged (which is
   *  fine — moves are visually obvious anyway). */
  function changedLinesAgainst(baseline: string, current: string): Set<number> {
    const baselineLines = new Set(baseline.split("\n"));
    const currentLines = current.split("\n");
    const out = new Set<number>();
    for (let i = 0; i < currentLines.length; i++) {
      const ln = currentLines[i];
      // Ignore blank lines — they're usually noise in markdown diffs.
      if (ln.trim() === "") continue;
      if (!baselineLines.has(ln)) out.add(i + 1);
    }
    return out;
  }

  function applyDiffHighlight(root: HTMLElement, baseline: string, current: string) {
    clearDiffHighlight(root);
    if (baseline === current) return;
    const changed = changedLinesAgainst(baseline, current);
    if (changed.size === 0) return;
    const els = root.querySelectorAll<HTMLElement>("[data-sourcepos]");
    for (const el of els) {
      const sp = el.dataset.sourcepos;
      if (!sp) continue;
      const m = /^(\d+):\d+-(\d+):\d+$/.exec(sp);
      if (!m) continue;
      const from = +m[1];
      const to = +m[2];
      for (let line = from; line <= to; line++) {
        if (changed.has(line)) {
          el.classList.add("diff-changed");
          break;
        }
      }
    }
  }

  function clearDiffHighlight(root: HTMLElement) {
    root.querySelectorAll(".diff-changed").forEach((el) =>
      el.classList.remove("diff-changed"),
    );
  }

  /** Paint Live Edit Theatre's highlights on elements whose data-sourcepos
   *  range overlaps any of the given line ranges. Fresh (green) wins over
   *  stale (yellow) when both match the same element. */
  function applyTheatreHighlight(
    root: HTMLElement,
    staleRanges: Array<{ from: number; to: number }>,
    freshRanges: Array<{ from: number; to: number }>,
  ) {
    clearTheatreHighlight(root);
    const hasStale = staleRanges && staleRanges.length > 0;
    const hasFresh = freshRanges && freshRanges.length > 0;
    if (!hasStale && !hasFresh) return;
    const els = root.querySelectorAll<HTMLElement>("[data-sourcepos]");
    for (const el of els) {
      const sp = el.dataset.sourcepos;
      if (!sp) continue;
      const m = /^(\d+):\d+-(\d+):\d+$/.exec(sp);
      if (!m) continue;
      const from = +m[1];
      const to = +m[2];
      let isFresh = false;
      if (hasFresh) {
        for (const r of freshRanges) {
          if (from <= r.to && to >= r.from) { isFresh = true; break; }
        }
      }
      if (isFresh) {
        el.classList.add("theatre-fresh");
        continue;
      }
      if (hasStale) {
        for (const r of staleRanges) {
          if (from <= r.to && to >= r.from) {
            el.classList.add("theatre-changed");
            break;
          }
        }
      }
    }
  }

  function clearTheatreHighlight(root: HTMLElement) {
    root.querySelectorAll(".theatre-changed, .theatre-fresh").forEach((el) => {
      el.classList.remove("theatre-changed");
      el.classList.remove("theatre-fresh");
    });
  }

  // Re-paint theatre highlights when ONLY the ranges props change (e.g.
  // user picks a different turn in the sidebar dropdown — source stays
  // the same, or the fresh-range decay loop just demoted a range to stale).
  // The main $effect above already handles source changes.
  $effect(() => {
    const stale = theatreHighlightRanges;
    const fresh = theatreFreshRanges;
    if (container) applyTheatreHighlight(container, stale, fresh);
  });

  function maybeFollowToLine(line: number) {
    if (!container) return;
    // Live-track is a viewer feature: in smart-edit mode the Viewer isn't
    // mounted at all, so this code path is naturally inert there. The setting
    // is also gated behind Settings → Experimental → "Live AI edit tracking".
    const el = findElementByLine(container, line);
    if (!el) return;

    let shouldScroll: boolean;
    if (settings.s.liveTrack) {
      // Live-track mode: ALWAYS follow. The user opted in to "follow the AI's
      // cursor" — they don't want us second-guessing whether the edit is near
      // their current scroll position. This was the bug where edits far below
      // the viewport never triggered a scroll.
      shouldScroll = true;
    } else {
      // Default: don't yank the user mid-read. Only scroll if the edit is
      // already near where they are, or they're tail-watching from the bottom.
      const elTop = el.offsetTop;
      const elBottom = elTop + el.offsetHeight;
      const visibleTop = container.scrollTop;
      const visibleBottom = visibleTop + container.clientHeight;
      const inViewport = elBottom > visibleTop && elTop < visibleBottom;
      const nearBottom = visibleBottom >= container.scrollHeight - 200;
      const nearChange =
        Math.abs(elTop - visibleBottom) < 400 ||
        Math.abs(elTop - visibleTop) < 400;
      shouldScroll = inViewport || nearBottom || nearChange;
    }

    if (shouldScroll) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Always-on: brief 1.4s flash that grabs the eye
    el.classList.add("live-edit-flash");
    setTimeout(() => el.classList.remove("live-edit-flash"), 1400);

    // Live-track: longer-lasting 6s accent on top of the flash
    if (settings.s.liveTrack) {
      el.classList.add("live-tracked");
      setTimeout(() => el.classList.remove("live-tracked"), 6000);
    }
  }

  /**
   * Resolve `./x`, `../x` and bare relative segments against a directory.
   * Left as a plain string join because `dir` is an OS path, not a URL —
   * `new URL()` would mangle a Windows drive letter.
   */
  function resolveRelative(dir: string, rel: string): string {
    const parts: string[] = [];
    for (const seg of `${dir}/${rel}`.split(/[\\/]+/)) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return parts.join("/");
  }

  async function rewriteRelativeImages(root: HTMLElement, base: string) {
    if (!base) return;
    const dir = base.replace(/[\\/][^\\/]*$/, "");
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
    if (imgs.length === 0) return;
    // Hoisted out of the loop: the import was previously fired per image and
    // never awaited, so the function returned before any src was patched and
    // the resulting height changes landed after re-anchoring.
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    for (const img of imgs) {
      const src = img.getAttribute("src");
      if (!src) continue;
      if (/^(https?:|data:|file:|asset:)/i.test(src)) continue;
      // `./img/x.png` used to be joined verbatim, leaving the `.` segment in
      // the asset URL after percent-encoding — a guaranteed 404. `../` was
      // worse: it never resolved at all.
      img.src = convertFileSrc(resolveRelative(dir, src));
    }
  }

  /**
   * Clicks inside the rendered document.
   *
   * Until v0.7.0 there was no handler here at all, so an ordinary external
   * link — of which a README has dozens — navigated the entire application
   * away to a web page, inside a window with no address bar, no Back button
   * and no reload. The only way out was closing the window.
   *
   * Three kinds of link, three destinations:
   *  - `#anchor`  → scroll this document (now that ids match GitHub's slugs)
   *  - `http(s)`  → the user's real browser
   *  - relative   → another markdown file, opened as a tab
   */
  async function onProseClick(e: MouseEvent) {
    const anchor = (e.target as HTMLElement | null)?.closest("a");
    if (!anchor) {
      // A click that isn't on a link might be on a highlight. Only checked when
      // the click did not end a drag-selection, or selecting text inside an
      // existing highlight would pop its thread open every time.
      if (window.getSelection()?.isCollapsed !== false) {
        const id = annotationAtPoint(e.clientX, e.clientY);
        if (id) {
          if (!settings.s.showComments) settings.set("showComments", true);
          annotations.expandedId = annotations.expandedId === id ? null : id;
        }
      }
      return;
    }
    const href = anchor.getAttribute("href");
    if (!href) return;

    if (href.startsWith("#")) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      // getElementById rather than a selector: a slug can legally contain
      // characters that would need CSS escaping.
      const target = container?.ownerDocument.getElementById(id);
      target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      return;
    }

    if (/^(https?|mailto):/i.test(href)) {
      e.preventDefault();
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(href);
      } catch (err) {
        console.error("[Fox MD] could not open link externally", err);
      }
      return;
    }

    // Relative link to a sibling document — the case that matters most in a
    // folder of cross-referencing handover docs.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && basePath) {
      const [rel] = href.split("#");
      if (/\.(md|markdown|mdown|mkd|mkdn|txt)$/i.test(rel)) {
        e.preventDefault();
        const dir = basePath.replace(/[\\/][^\\/]*$/, "");
        onOpenRelative?.(resolveRelative(dir, decodeURIComponent(rel)));
      }
    }
  }

  /** Right-click inside the document: offers what you can do with whatever is
   *  under the cursor — a selection, a link, a heading — then the page. */
  function onProseContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    const selection = (window.getSelection()?.toString() ?? "").trim();
    const anchor = target?.closest("a");
    const href = anchor?.getAttribute("href") ?? "";
    const heading = target?.closest("h1, h2, h3, h4, h5, h6");
    const items: MenuEntry[] = [];

    if (selection) {
      const preview = selection.length > 28 ? `${selection.slice(0, 28)}…` : selection;
      items.push({
        label: `Copy “${preview}”`,
        icon: "copy",
        shortcut: sk("Mod", "C"),
        action: () => copyText(selection),
      });
      items.push({
        label: "Find in document",
        icon: "search",
        action: () => onFindSelection?.(selection),
      });
      items.push({ separator: true });
    }

    if (anchor && /^(https?|mailto):/i.test(href)) {
      items.push({
        label: "Open link in browser",
        icon: "external-link",
        action: () => import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(href)),
      });
      items.push({ label: "Copy link address", icon: "link", action: () => copyText(href) });
      items.push({ separator: true });
    }

    if (heading?.id) {
      items.push({
        label: "Copy link to section",
        icon: "link",
        action: () => copyText(`#${heading.id}`),
      });
      items.push({ separator: true });
    }

    items.push({
      label: "Back to top",
      icon: "arrow-up-to-line",
      action: () => container?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }),
    });
    items.push({
      label: "Reload from disk",
      icon: "refresh",
      action: () => onReloadRequest?.(),
    });

    contextMenu.open(e, items);
  }
</script>

<div
  class="viewer"
  class:lane-on={laneOn}
  class:lane-float={laneOn && paneWidth < 900}
  class:full-width={settings.s.fullWidth}
  class:center-headings={settings.s.centerHeadings}
  style="--zoom: {settings.s.zoom}; --font-size: {settings.s.fontSize}px; --font-family: {settings.s.fontFamily}; --content-width: {settings.s.contentWidthCh}ch;"
  bind:this={container}
  onscroll={onScroll}
>
  <!-- Measures one `ch` in the document's own font, at the document's own
       zoom. Inside `.viewer` (not `.prose`) so it survives every re-render. -->
  <span class="ch-probe" bind:this={chProbe} aria-hidden="true">00000000000000000000</span>

  <!-- Delegated: the prose is replaced wholesale on every render, so a
       listener on the container is the only place a handler can survive.
       svelte-ignore is correct — this is event delegation over rendered
       content, not a control masquerading as a div. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <article
    class="prose"
    onclick={onProseClick}
    oncontextmenu={onProseContextMenu}
  >{@html html}</article>

  {#if laneOn}
    <CommentLane
      {placed}
      detachedIds={annotations.detached}
      {author}
      {paneWidth}
      onGoTo={goToAnnotation}
    />
  {/if}

  <ResumeMarker
    show={markerVisible}
    y={markerY}
    right={markerRight}
    anchor={markerState}
    fresh={markerFresh}
    onJump={jumpToResume}
    onDismiss={dismissMarker}
  />
</div>

<SelectionToolbar
  rect={mode === "view" ? selRect : null}
  onHighlight={highlightSelection}
  onComment={commentOnSelection}
  onCopy={copySelection}
/>

<style>
  /* Outer scroll container — full width of the parent flex slot.
     position:relative makes it the offsetParent for content blocks, which is
     what lets the live-follow maths use offsetTop
     directly instead of guessing at an ancestor. */
  .viewer {
    position: relative;
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 3rem 0 5rem;
    font-size: calc(var(--font-size, 16px) * var(--zoom, 1));
    font-family: var(--font-family);
    line-height: 1.65;
    color: var(--fg);
    background: var(--bg);
    text-align: left;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    font-feature-settings: "kern", "liga", "calt", "ss01";
  }

  /* The actual content column — measure-capped, centered horizontally.
     This is the only block that handles centering. Children just flow normally.

     `box-sizing: border-box` is global, so a plain `max-width` had the gutter
     *subtracted from* the measure — and since the gutter is `5vw`, the actual
     line length changed as the window resized even though the user's setting
     hadn't moved. Adding the padding into the width makes the number mean what
     it says: 76ch of type, at every window size. */
  .prose {
    width: min(100%, calc(var(--content-width) + 2 * clamp(1.25rem, 5vw, 3.5rem)));
    margin: 0 auto;
    padding: 0 clamp(1.25rem, 5vw, 3.5rem);
    text-align: start;
  }
  .viewer.full-width .prose { width: 100%; }

  /* The comment lane is *reserved*, by padding the scroll container. `.prose`
     still centres itself with `margin: 0 auto`, now inside a narrower content
     box — so an expanded card never covers text, and expanding one costs no
     reflow because the space was already there.

     Padding rather than a margin on `.prose`: an absolutely positioned child is
     laid out against the *padding* box, so `right: 0` on the lane puts it
     exactly in the reserved strip, and `margin-right` on a `margin: 0 auto`
     block would shove the column right instead of re-centring it. */
  .viewer.lane-on { --comment-lane: clamp(272px, 26%, 344px); padding-right: var(--comment-lane); }
  /* Below the lane's minimum width the cards float over the edge instead (see
     CommentLane), so the text must not be squeezed for a column that is no
     longer being reserved. Measured in JS, not a container query: making
     `.viewer` a size container adds `contain` to the app's main scroller, which
     is not a side effect worth accepting for one breakpoint. */
  .viewer.lane-on.lane-float { padding-right: 40px; }

  .ch-probe {
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    pointer-events: none;
    white-space: pre;
    font: inherit;
    letter-spacing: inherit;
  }

  .prose :global(> *:first-child) { margin-top: 0; }
  .prose :global(> *:last-child)  { margin-bottom: 0; }

  .viewer.center-headings :global(h1),
  .viewer.center-headings :global(h2),
  .viewer.center-headings :global(h3),
  .viewer.center-headings :global(h4),
  .viewer.center-headings :global(h5),
  .viewer.center-headings :global(h6) {
    text-align: center !important;
  }

  /* ─── Headings ─────────────────────────────────────────── */
  .viewer :global(h1),
  .viewer :global(h2),
  .viewer :global(h3),
  .viewer :global(h4),
  .viewer :global(h5),
  .viewer :global(h6) {
    display: block;
    /* `start`, not `left !important`. The !important here used to defeat
       `<div align="center">` wrappers — the standard README hero — leaving the
       title hard-left while the badges under it centred. The `center-headings`
       setting carries its own !important, so it still wins without this. */
    text-align: start;
    text-indent: 0;
    padding-inline: 0;
    line-height: 1.25;
    margin-top: 2em;
    margin-bottom: .6em;
    letter-spacing: -0.012em;
    font-weight: 600;
    color: var(--fg-strong);
    /* Anchor jumps otherwise land the heading flush against the top edge. */
    scroll-margin-top: 1.5rem;
  }
  /* Comrak's header_ids feature emits an empty <a class="anchor"> beside or inside
     each heading. We don't want it visible, but it must remain a layout target so the
     TOC can scrollIntoView. Collapse it to a 0×0 inline-block. */
  .viewer :global(a.anchor) {
    display: inline-block !important;
    width: 0 !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
  /* Type scale.

     The old scale decelerated to a stop: h4 was 1.05em and h5 exactly 1em —
     body size — with weight 600 and --fg-strong as their only distinction.
     That is character-for-character how `strong` is styled, so `##### Heading`
     and a `**bold lead-in**` rendered identically. In a nested audit document
     the hierarchy simply ended at h3.

     The fix is to stop competing on size at the bottom of the scale and
     switch to *shape*: h4 outweighs `strong` at 700, and h5/h6 go to small
     caps. Nothing below h3 relies on being bigger than the paragraph. */
  .viewer :global(h1) {
    font-size: 2em;
    font-weight: 700;
    letter-spacing: -0.02em;
    /* Mid-document h1s used to collapse to paragraph spacing; `.prose >
       *:first-child` already zeroes the one at the top of the file. */
    margin-top: 2.6em;
    margin-bottom: .5em;
  }
  .viewer :global(h2) {
    font-size: 1.55em;
    font-weight: 650;
    letter-spacing: -0.015em;
    margin-top: 2.2em;
    padding-bottom: .35em;
    border-bottom: 1px solid var(--border);
  }
  /* Below h2 the top margins are tuned so the *rendered* gap lands at
     ~31–36px at every level, rather than the em-multiplier being constant and
     the real gap shrinking with the font — which is what left h5 and h6 with
     barely more air above them than an ordinary paragraph break. */
  .viewer :global(h3) { font-size: 1.28em; font-weight: 650; letter-spacing: -0.01em; margin-top: 1.85em; }
  .viewer :global(h4) { font-size: 1.08em; font-weight: 700; letter-spacing: 0; margin-top: 1.9em; }
  .viewer :global(h5) {
    font-size: .96em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .05em;
    margin-top: 2.1em;
  }
  .viewer :global(h6) {
    font-size: .84em;
    color: var(--muted-strong);
    text-transform: uppercase;
    letter-spacing: .08em;
    font-weight: 600;
    margin-top: 2.4em;
  }

  /* ─── Vertical rhythm between blocks ───────────────────────
     There was not a single adjacent-sibling rule in this stylesheet before
     v0.7.0. Every gap was decided in isolation and then resolved by margin
     collapsing, which produced three specific complaints in long documents:
     an `h2` followed immediately by its own first `h3` opened a 33px gulf; a
     list did not group with the sentence introducing it; and consecutive list
     items sat 3px apart while the lines *inside* an item sat 26px apart, so
     the item boundary vanished. */
  .viewer :global(h1 + h2) { margin-top: 1.1em; }
  .viewer :global(h2 + h3) { margin-top: .85em; }
  .viewer :global(h3 + h4) { margin-top: .8em; }
  .viewer :global(h4 + h5),
  .viewer :global(h5 + h6) { margin-top: .9em; }
  .viewer :global(hr + h1),
  .viewer :global(hr + h2) { margin-top: 1.2em; }

  /* A block that answers the paragraph above it belongs *to* that paragraph. */
  .viewer :global(p + ul),
  .viewer :global(p + ol) { margin-top: .25em; }
  .viewer :global(p + pre),
  .viewer :global(p + blockquote) { margin-top: .5em; }
  .viewer :global(p + .table-scroll) { margin-top: .6em; }

  /* ─── Paragraph & inline ───────────────────────────────── */
  .viewer :global(p) { margin: .85em 0; }
  .viewer :global(strong) { font-weight: 600; color: var(--fg-strong); }
  .viewer :global(em) { font-style: italic; }
  .viewer :global(del) { color: var(--muted); }
  .viewer :global(mark) {
    background: var(--highlight-bg);
    color: inherit;
    padding: 0 .15em;
    border-radius: 2px;
  }
  .viewer :global(sup),
  .viewer :global(sub) { font-size: .75em; line-height: 0; vertical-align: baseline; position: relative; }
  .viewer :global(sup) { top: -.5em; }
  .viewer :global(sub) { bottom: -.25em; }
  .viewer :global(kbd) {
    background: var(--muted-bg);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 0 .35em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Cascadia Mono", monospace;
    font-size: .85em;
    line-height: 1;
  }

  /* ─── Links ──────────────────────────────────────────────
     Underlined at rest. Colour alone was the only cue, and it doesn't carry:
     link-vs-body contrast measures ~1.9:1 in dark and ~1.8:1 in sepia, where a
     link is a slightly warmer brown inside brown text. WCAG wants ≥3:1 for a
     colour-only distinction; underlining sidesteps the question entirely and
     is the right default for a reading app regardless. */
  .viewer :global(a) {
    color: var(--link);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-decoration-color: var(--border-strong);
    text-underline-offset: 2.5px;
    /* A bare autolinked URL can be 70+ characters — longer than the column. */
    overflow-wrap: anywhere;
  }
  .viewer :global(a:hover) { text-decoration-color: currentColor; }
  /* Badge rows are links wrapping images; an underline under each one is
     just a stray rule across the hero. */
  .viewer :global(a:has(> img)) { text-decoration: none; }

  /* ─── Code ─────────────────────────────────────────────── */
  .viewer :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Cascadia Mono", monospace;
    background: var(--code-inline-bg);
    padding: .12em .4em;
    border-radius: 4px;
    font-size: .88em;
    /* `C:\Users\kadar\.claude\projects\D--Claude-Code-Projects\memory\` is 62
       characters — ~525px at this size, most of the column. Without this it
       paints straight through the gutter and is clipped, unreachable, by the
       viewport's `overflow-x: hidden`. `anywhere` rather than `break-word` so
       it also contributes a small min-content width inside table cells. */
    overflow-wrap: anywhere;
  }
  .viewer :global(pre) {
    /* syntect emits an inline `style="background-color:#fff"` on the <pre>
       element, which would shadow our themed surface (especially noticeable
       in sepia mode where the rest of the page is cream). The !important
       isn't decorative — it's the only way to override inline styles. */
    background: var(--code-bg) !important;
    padding: 1em 1.1em;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1.5em 0;
    font-size: .88em;
    line-height: 1.55;
    border: 1px solid var(--border);
    /* Anchors the language label and the copy button. */
    position: relative;
  }
  .viewer :global(pre > code) {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: 1em;
    color: inherit;
    /* Code blocks scroll; they must never reflow mid-token. */
    overflow-wrap: normal;
  }
  /* Language label. Set from the `language-*` class in post-render.ts. */
  .viewer :global(pre[data-lang]) { padding-top: 2.2em; }
  .viewer :global(pre[data-lang])::before {
    content: attr(data-lang);
    position: absolute;
    top: .55em;
    left: 1.15em;
    font-size: .72em;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--muted);
    pointer-events: none;
    font-family: inherit;
  }
  /* Copy button — appears on hover, and stays put when the block scrolls
     horizontally because it's anchored to the <pre>, not the content. */
  .viewer :global(.code-copy) {
    position: absolute;
    top: .45em;
    right: .5em;
    font: inherit;
    font-size: .72em;
    line-height: 1;
    padding: .35em .65em;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--muted-strong);
    cursor: default;
    opacity: 0;
    transition: opacity 120ms ease, color 120ms ease;
  }
  .viewer :global(pre:hover) :global(.code-copy),
  .viewer :global(.code-copy:focus-visible) { opacity: 1; }
  .viewer :global(.code-copy:hover) { color: var(--fg-strong); }
  .viewer :global(.code-copy.ok) { opacity: 1; color: #2ea043; border-color: #2ea043; }

  /* ─── Blockquote ─────────────────────────────────────────
     Full contrast, not muted. In this corpus blockquotes carry the *highest*
     stakes content — "last audited", "verified on", the warnings an author
     pulled out precisely so they'd be read — so rendering them dimmer than
     body text inverted the author's emphasis. (It also failed WCAG AA in
     sepia at 3.5:1.) `--blockquote-bg` has been declared in all three palettes
     since v0.5.1 and was never referenced; it is now. */
  .viewer :global(blockquote) {
    border-left: 3px solid var(--border-strong);
    margin: 1.5em 0;
    padding: .5em 1.2em;
    color: var(--fg);
    background: var(--blockquote-bg);
    border-radius: 0 6px 6px 0;
  }
  .viewer :global(blockquote > :first-child) { margin-top: 0; }
  .viewer :global(blockquote > :last-child)  { margin-bottom: 0; }
  .viewer :global(blockquote p) { margin: .5em 0; }

  /* ─── GFM Alerts ───────────────────────────────────────── */
  .viewer :global(.markdown-alert) {
    border-left: 4px solid var(--alert-color, var(--accent));
    background: var(--alert-bg, transparent);
    margin: 1.2em 0;
    padding: .7em 1.2em;
    border-radius: 0 6px 6px 0;
    color: var(--fg);
  }
  .viewer :global(.markdown-alert > :first-child) { margin-top: 0; }
  .viewer :global(.markdown-alert > :last-child)  { margin-bottom: 0; }
  .viewer :global(.markdown-alert-title) {
    display: flex;
    align-items: center;
    gap: .4em;
    font-weight: 600;
    color: var(--alert-color);
    text-transform: uppercase;
    font-size: .8em;
    letter-spacing: .06em;
    margin-bottom: .4em;
  }
  .viewer :global(.markdown-alert-title::before) {
    content: "";
    display: inline-block;
    width: 1em; height: 1em;
    background-color: currentColor;
    -webkit-mask: var(--alert-icon) center / contain no-repeat;
            mask: var(--alert-icon) center / contain no-repeat;
  }
  /* The five accent colours below are GitHub's *dark*-mode tokens, which is
     why alerts looked right in dark mode and washed out everywhere else — all
     five measure between 2.4:1 and 3.4:1 on white, at 12.8px, so all five fail
     WCAG AA in the light and sepia themes. GitHub's light tokens (≥4.5:1) take
     over there; the originals stay for dark, where they belong. */
  :global(html[data-theme="light"]) .viewer :global(.markdown-alert-note),
  :global(html[data-theme="sepia"]) .viewer :global(.markdown-alert-note) { --alert-color: #0969da; }
  :global(html[data-theme="light"]) .viewer :global(.markdown-alert-tip),
  :global(html[data-theme="sepia"]) .viewer :global(.markdown-alert-tip) { --alert-color: #1a7f37; }
  :global(html[data-theme="light"]) .viewer :global(.markdown-alert-important),
  :global(html[data-theme="sepia"]) .viewer :global(.markdown-alert-important) { --alert-color: #8250df; }
  :global(html[data-theme="light"]) .viewer :global(.markdown-alert-warning),
  :global(html[data-theme="sepia"]) .viewer :global(.markdown-alert-warning) { --alert-color: #9a6700; }
  :global(html[data-theme="light"]) .viewer :global(.markdown-alert-caution),
  :global(html[data-theme="sepia"]) .viewer :global(.markdown-alert-caution) { --alert-color: #cf222e; }
  /* 8% tint is invisible against a dark page; lift it to 14% in dark mode.
     Written out per alert rather than as `color-mix(... 14%, transparent)`:
     this codebase deliberately avoids color-mix (see the notes in
     +page.svelte's palette and in ResumeMarker) because it is not guaranteed
     on the older WebView2 and WebKitGTK builds these installers run against,
     and an unsupported declaration here would silently drop the tint
     altogether rather than degrade. */
  :global(html[data-theme="dark"]) .viewer :global(.markdown-alert-note) {
    --alert-bg: rgba(68, 147, 248, 0.14);
  }
  :global(html[data-theme="dark"]) .viewer :global(.markdown-alert-tip) {
    --alert-bg: rgba(63, 185, 80, 0.14);
  }
  :global(html[data-theme="dark"]) .viewer :global(.markdown-alert-important) {
    --alert-bg: rgba(171, 125, 248, 0.14);
  }
  :global(html[data-theme="dark"]) .viewer :global(.markdown-alert-warning) {
    --alert-bg: rgba(210, 153, 34, 0.14);
  }
  :global(html[data-theme="dark"]) .viewer :global(.markdown-alert-caution) {
    --alert-bg: rgba(248, 81, 73, 0.14);
  }
  .viewer :global(.markdown-alert-note) {
    --alert-color: #4493f8;
    --alert-bg: rgba(56, 139, 253, 0.08);
    --alert-icon: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="black" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75M8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/></svg>');
  }
  .viewer :global(.markdown-alert-tip) {
    --alert-color: #3fb950;
    --alert-bg: rgba(46, 160, 67, 0.08);
    --alert-icon: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="black" d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75M5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5M6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75"/></svg>');
  }
  .viewer :global(.markdown-alert-important) {
    --alert-color: #ab7df8;
    --alert-bg: rgba(137, 87, 229, 0.08);
    --alert-icon: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="black" d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.189l2.72-2.719a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0M9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/></svg>');
  }
  .viewer :global(.markdown-alert-warning) {
    --alert-color: #d29922;
    --alert-bg: rgba(187, 128, 9, 0.08);
    --alert-icon: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="black" d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0M9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/></svg>');
  }
  .viewer :global(.markdown-alert-caution) {
    --alert-color: #f85149;
    --alert-bg: rgba(229, 83, 75, 0.08);
    --alert-icon: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="black" d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4m0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/></svg>');
  }

  /* ─── Lists ────────────────────────────────────────────── */
  .viewer :global(ul),
  .viewer :global(ol) {
    padding-left: 1.7em;
    margin: .65em 0;
  }
  /* 3.2px between items, against a 26px line-height *inside* an item, meant
     the eye could not find the item boundary in any list whose entries ran to
     more than one line — which, in these documents, is most of them. */
  .viewer :global(li) { margin: 0; }
  .viewer :global(li + li) { margin-top: .4em; }
  .viewer :global(li > p) {
    margin: .35em 0;
  }
  .viewer :global(li > p:first-child) { margin-top: 0; }
  .viewer :global(li > p:last-child)  { margin-bottom: 0; }
  .viewer :global(li > ul),
  .viewer :global(li > ol) {
    margin: .4em 0 .1em;
  }
  .viewer :global(ul) { list-style: disc; }
  .viewer :global(ul ul) { list-style: circle; }
  .viewer :global(ul ul ul) { list-style: square; }

  /* Task list items. `render.tasklist_classes` is now on, so `.task-list-item`
     is a real hook rather than dead CSS riding entirely on the `:has()`
     sibling. The old `margin-left: -1.4em` pulled task items 1.4em left of
     plain bullets, so a mixed list had two different left edges; the checkbox
     hangs into the gutter instead, keeping every item on one axis. */
  .viewer :global(li.task-list-item),
  .viewer :global(li:has(> input[type="checkbox"])) {
    list-style: none;
    margin-left: 0;
    padding-left: 0;
  }
  .viewer :global(li > input[type="checkbox"]) {
    margin: 0 .5em 0 -1.55em;
    transform: translateY(.05em);
    accent-color: var(--accent);
    width: 1em;
    height: 1em;
    cursor: default;
  }

  /* ─── Tables ─────────────────────────────────────────────
     Three problems, all fixed here.

     1. **Wide tables were clipped and unreachable.** `overflow-x: auto` does
        nothing on `display: table`, and above 600px — i.e. always, on a
        desktop — that is what the table was. Anything wider than the prose
        column overflowed into `.viewer`, which is `overflow-x: hidden`. The
        columns weren't just off-screen, they were unreachable. post-render.ts
        now wraps every table in `.table-scroll`, which is a real scroller.
     2. **Column alignment was silently discarded.** comrak emits GFM's
        `:---:` as `align="center"`, a presentational hint at specificity 0 —
        which the blanket `text-align: left` below beat every single time.
     3. **Grid plus zebra is a spreadsheet, not prose** — and the zebra was a
        1.6% step in light mode (invisible) while in sepia `--zebra-bg` and
        `--muted-bg` were the *same value*, so the header row disappeared into
        the body. Horizontal rules only, now. */
  .viewer :global(.table-scroll) {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    margin: 1.6em 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    /* The radius only renders because the wrapper clips — a `border-collapse`
       table paints its own square corners straight through a radius. */
    overflow-y: hidden;
  }
  .viewer :global(table) {
    border-collapse: collapse;
    margin: 0;
    font-size: .94em;
    /* **Fit the column and wrap.** This was `width: max-content`, which asks
       the browser for the width the table would take with no line-breaking at
       all — so a three-column table with two prose columns of ~20 words each
       claimed a couple of thousand pixels and pushed the reader into a
       horizontal scroll, when the same content wraps comfortably into the
       page. `max-content` is the right answer for a table of file paths and
       the wrong one for a table of sentences, and prose is the common case.
       The wrapper still scrolls when a table genuinely cannot fit — see the
       cell `min-width` below, which is what decides "genuinely". */
    width: 100%;
    table-layout: auto;
  }
  .viewer :global(th),
  .viewer :global(td) {
    border: 0;
    border-bottom: 1px solid var(--border);
    padding: .55em .85em;
    text-align: start;
    vertical-align: top;
    /* The floor that decides when wrapping stops and scrolling starts.
       Auto table layout will otherwise squeeze a 12-column table down to a
       few characters per column — technically "fitting", actually unreadable
       — because `overflow-wrap: anywhere` below lets any cell shrink to one
       glyph. With a floor, a table wider than ~10 columns overflows and the
       wrapper scrolls, which is the correct behaviour for a genuinely wide
       table. Prose tables never come near it. */
    min-width: 7ch;
    /* 1.65 is a reading line-height; in a dense grid it adds ~30% height for
       nothing. */
    line-height: 1.45;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  .viewer :global(th[align="center"]),
  .viewer :global(td[align="center"]) { text-align: center; }
  .viewer :global(th[align="right"]),
  .viewer :global(td[align="right"]) { text-align: right; }
  .viewer :global(thead th) {
    background: transparent;
    border-bottom: 2px solid var(--border-strong);
    font-weight: 650;
    font-size: .92em;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--muted-strong);
    /* The wrapper scrolls, so a header never needs to wrap to fit. */
    white-space: nowrap;
  }
  .viewer :global(tbody tr:last-child td) { border-bottom: 0; }

  /* ─── Images ─────────────────────────────────────────────
     Inline by default, block only when an image is alone in its paragraph.
     The old rule was the other way round with a `p > img` exception — which
     never matched the standard badge row `[![alt](img)](link)`, because there
     the image's parent is the `<a>`, not the `<p>`. Three download badges
     rendered as three stacked centred blocks. */
  .viewer :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    display: inline-block;
    vertical-align: middle;
  }
  /* An image alone in its paragraph is a figure, so it centres as a block.
     Two selectors on purpose: `:only-child` is universally supported and
     covers `<p><img></p>`, which is the overwhelmingly common shape. The
     `:has()` variant additionally catches `<p><img><br></p>` and friends — but
     WebKitGTK on Ubuntu 22.04 (what the .deb/AppImage may run against) predates
     `:has()`, and an unsupported `:has()` invalidates the *whole* selector.
     Relying on it alone would have left every standalone image inline on
     Linux. Keep the plain rule first. */
  .viewer :global(p > img:only-child) {
    display: block;
    margin: 1.4em auto;
  }
  .viewer :global(p:not(:has(> :not(img):not(br))) > img) {
    display: block;
    margin: 1.4em auto;
  }

  /* ─── Details / summary ────────────────────────────────── */
  .viewer :global(details) {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: .6em 1em;
    margin: 1.5em 0;
    background: var(--muted-bg);
  }
  .viewer :global(details[open]) { padding-bottom: 1em; }
  .viewer :global(summary) {
    cursor: default;
    font-weight: 600;
    color: var(--fg-strong);
    list-style: none;
    display: flex;
    align-items: center;
    gap: .5em;
  }
  .viewer :global(summary::-webkit-details-marker) { display: none; }
  .viewer :global(summary::before) {
    content: "›";
    font-size: 1.2em;
    line-height: 1;
    color: var(--muted);
    transition: transform 150ms ease;
  }
  .viewer :global(details[open]) :global(summary::before) { transform: rotate(90deg); }

  /* ─── Horizontal rule ──────────────────────────────────── */
  .viewer :global(hr) {
    border: 0;
    height: 1px;
    background: var(--border);
    margin: 3em 0;
    width: 100%;
  }

  /* ─── Anchor-jump feedback ─────────────────────────────── */
  .viewer :global(:target) {
    animation: target-flash 1.6s ease-out;
    border-radius: 4px;
  }
  @keyframes target-flash {
    0%, 30% { background: var(--accent-soft); box-shadow: 0 0 0 6px var(--accent-soft); }
    100%    { background: transparent; box-shadow: none; }
  }

  /* ─── Footnotes ────────────────────────────────────────── */
  .viewer :global(.footnotes) {
    margin-top: 3em;
    padding-top: 1em;
    border-top: 1px solid var(--border);
    font-size: .9em;
    color: var(--muted);
  }
  .viewer :global(.footnotes ol) { padding-left: 1.4em; }
  .viewer :global(.footnotes li) { margin: .35em 0; }
  .viewer :global(sup.footnote-ref a),
  .viewer :global(.footnote-backref) {
    text-decoration: none;
    font-size: .85em;
  }
  .viewer :global(.footnote-backref) { margin-left: .3em; }

  /* ─── Definition lists ─────────────────────────────────── */
  .viewer :global(dl) { margin: 1em 0; }
  .viewer :global(dt) { font-weight: 600; margin-top: .6em; }
  .viewer :global(dd) { margin-left: 1.6em; margin-top: .15em; color: var(--muted); }

  /* ─── Math (KaTeX) ─────────────────────────────────────── */
  .viewer :global(.katex) { font-size: 1.05em; }
  .viewer :global(.katex-display) {
    margin: 1em 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: .25em 0;
  }

  /* ─── Live-follow flash on changed elements ────────────── */
  @keyframes live-edit-flash {
    0%   { background-color: var(--accent-soft); box-shadow: 0 0 0 4px var(--accent-soft); }
    100% { background-color: transparent; box-shadow: 0 0 0 0 transparent; }
  }
  .viewer :global(.live-edit-flash) {
    animation: live-edit-flash 1.4s ease-out;
    border-radius: 4px;
  }

  /* ─── Live-track persistent accent (toggled by settings.liveTrack) ─ */
  @keyframes live-tracked-accent {
    0%   { background-color: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
    25%  { background-color: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
    100% { background-color: transparent; box-shadow: inset 0 0 0 transparent; }
  }
  .viewer :global(.live-tracked) {
    animation: live-tracked-accent 6s ease-out;
    border-radius: 4px;
  }

  /* ─── Diff mode: cumulative highlighting against a baseline ────── */
  .viewer :global(.diff-changed) {
    background-color: rgba(46, 160, 67, 0.10);
    box-shadow: inset 3px 0 0 #2ea043;
    border-radius: 4px;
    padding-left: 8px;
    margin-left: -11px;
  }
  :global(html[data-theme="dark"]) .viewer :global(.diff-changed) {
    background-color: rgba(63, 185, 80, 0.14);
    box-shadow: inset 3px 0 0 #3fb950;
  }

  /* ─── Live Edit Theatre: yellow highlights on changed regions ──── */
  .viewer :global(.theatre-changed) {
    background-color: rgba(255, 211, 0, 0.18);
    box-shadow: inset 3px 0 0 #f5b800;
    border-radius: 4px;
    padding-left: 8px;
    margin-left: -11px;
    transition: background-color 350ms ease, box-shadow 350ms ease;
  }
  :global(html[data-theme="dark"]) .viewer :global(.theatre-changed) {
    background-color: rgba(255, 211, 0, 0.10);
    box-shadow: inset 3px 0 0 #d49c00;
  }

  /* ─── Live Edit Theatre: green "currently being edited" highlights ──
     Painted on top of the stale yellow set with mutual exclusion (only
     one class per element). A subtle pulse signals liveness; the fade
     happens via the transition above when the decay loop demotes the
     range to stale (yellow). v0.5.0+. */
  .viewer :global(.theatre-fresh) {
    background-color: rgba(74, 222, 128, 0.20);
    box-shadow: inset 3px 0 0 #22c55e,
                inset -1px 0 0 rgba(34, 197, 94, .35),
                inset 0 1px 0 rgba(34, 197, 94, .25),
                inset 0 -1px 0 rgba(34, 197, 94, .25);
    border-radius: 4px;
    padding-left: 8px;
    margin-left: -11px;
    animation: theatre-fresh-pulse 1.4s ease-in-out infinite;
    transition: background-color 200ms ease;
  }
  :global(html[data-theme="dark"]) .viewer :global(.theatre-fresh) {
    background-color: rgba(74, 222, 128, 0.13);
    box-shadow: inset 3px 0 0 #16a34a,
                inset -1px 0 0 rgba(22, 163, 74, .45),
                inset 0 1px 0 rgba(22, 163, 74, .3),
                inset 0 -1px 0 rgba(22, 163, 74, .3);
  }
  @keyframes theatre-fresh-pulse {
    0%, 100% { background-color: rgba(74, 222, 128, 0.20); }
    50%      { background-color: rgba(74, 222, 128, 0.34); }
  }
  :global(html[data-theme="dark"]) .viewer :global(.theatre-fresh) {
    animation-name: theatre-fresh-pulse-dark;
  }
  @keyframes theatre-fresh-pulse-dark {
    0%, 100% { background-color: rgba(74, 222, 128, 0.13); }
    50%      { background-color: rgba(74, 222, 128, 0.24); }
  }

  /* Respect the OS "reduce motion" preference: the highlights still carry
     their colour and left-bar, they just stop moving. The information is in
     the colour, never in the animation. */
  @media (prefers-reduced-motion: reduce) {
    .viewer :global(.theatre-fresh),
    .viewer :global(.live-edit-flash),
    .viewer :global(.live-tracked),
    .viewer :global(:target) {
      animation: none;
    }
    .viewer :global(summary::before),
    .viewer :global(.code-copy) { transition: none; }
  }

  /* ─── Print ────────────────────────────────────────────────
     People hand these documents to other people. Printing one previously
     produced a single clipped page, because the scroll container's own
     `overflow` is what the print engine honours. */
  @media print {
    .viewer {
      overflow: visible;
      height: auto;
      background: #fff;
      color: #000;
      padding: 0;
    }
    .prose { width: 100%; max-width: none; padding: 0; }
    .viewer :global(pre),
    .viewer :global(blockquote),
    .viewer :global(.table-scroll),
    .viewer :global(.markdown-alert),
    .viewer :global(img) { break-inside: avoid; }
    .viewer :global(h1),
    .viewer :global(h2),
    .viewer :global(h3),
    .viewer :global(h4) { break-after: avoid; }
    .viewer :global(.table-scroll) { overflow: visible; }
    .viewer :global(.code-copy) { display: none; }
    /* A URL you cannot see is not a citation. */
    .viewer :global(a[href^="http"])::after {
      content: " (" attr(href) ")";
      font-size: .85em;
      color: #444;
      overflow-wrap: anywhere;
    }
  }

  /* ─── Mermaid ──────────────────────────────────────────── */
  .viewer :global(.mermaid-rendered) {
    display: flex;
    justify-content: center;
    margin: 1.4em 0;
  }
  .viewer :global(.mermaid-rendered svg) { max-width: 100%; height: auto; }
  .viewer :global(.mermaid-error) {
    color: #c00;
    font-family: ui-monospace, monospace;
    padding: .5em .8em;
    background: rgba(200, 0, 0, 0.08);
    border-left: 3px solid #c00;
    border-radius: 0 4px 4px 0;
  }
</style>
