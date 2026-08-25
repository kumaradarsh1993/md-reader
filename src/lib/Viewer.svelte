<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { api } from "./api";
  import { settings, effectiveDark, effectiveThemeName, type ScrollMark } from "./settings-store.svelte";
  import { contextMenu, type MenuEntry } from "./context-menu.svelte";
  import { sk, copyText } from "./platform";
  import { postRender } from "./post-render";
  import { viewNav } from "./view-nav.svelte";
  import ResumeRibbon from "./ResumeRibbon.svelte";

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
    /** Position carried over from a previous session — anchors the ribbon. */
    resumeMark?: ScrollMark | null;
    /** User has dismissed the ribbon for this tab. */
    resumeDismissed?: boolean;
    /** The cross-session position has already been applied once for this tab,
     *  so a remount (edit ↔ view, theme change) shouldn't re-announce it. */
    resumeApplied?: boolean;
    /** Reports the reading position as it changes (throttled). */
    onScrollMark?: (tabId: string, mark: ScrollMark) => void;
    /** Fired once the cross-session position has been applied. */
    onResumeApplied?: (tabId: string) => void;
    /** User clicked the ribbon's dismiss affordance. */
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

  // ═══ Reading position: per-tab memory, scroll-spy, resume ribbon ═══════
  //
  // One Viewer instance serves every tab, so all of this keys off `tabId`.
  // The invariants that matter:
  //   · a scroll event must never be attributed to a tab other than the one
  //     that was on screen when it fired;
  //   · a programmatic scroll (restore / jump / live-follow) must not be
  //     mistaken for the reader moving, or it would overwrite the very mark
  //     it just restored.

  /** Top-level blocks with their source-line ranges, rebuilt after each
   *  render so scroll handling is a cheap array walk rather than a DOM query. */
  let lineIndex: Array<{ el: HTMLElement; from: number; to: number }> = [];
  /** Same, restricted to headings — drives the outline's active-section mark. */
  let headingIndex: Array<{ el: HTMLElement; line: number }> = [];

  /** Set while we're moving the scroll position ourselves. */
  let programmaticScroll = false;
  let programmaticTimer: ReturnType<typeof setTimeout> | null = null;
  let navRaf = 0;
  let markTimer: ReturnType<typeof setTimeout> | null = null;
  /** The tab a pending mark write belongs to. */
  let pendingMarkTabId = "";
  let pendingMark: ScrollMark | null = null;

  // Ribbon geometry, recomputed on scroll / render.
  let ribbonTop = $state(0);
  let ribbonInView = $state(true);
  let ribbonResolved = $state(false);
  let edgeTop = $state(0);
  let edgeRight = $state(16);
  /** True for a few seconds after a resume, so the ribbon can announce itself. */
  let ribbonFresh = $state(false);
  let freshTimer: ReturnType<typeof setTimeout> | null = null;

  let ribbonVisible = $derived(
    settings.s.resumeRibbon &&
      settings.s.rememberScroll &&
      !!resumeMark &&
      !resumeDismissed &&
      ribbonResolved &&
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
      lineIndex.push({ el, from: range.from, to: range.to });
      if (/^H[1-6]$/.test(el.tagName)) headingIndex.push({ el, line: range.from });
    }
  }

  /** The last indexed block starting at or above `probeY` (a viewport-space Y),
   *  and the last heading at or above it. Both are needed: the outline
   *  highlights by heading, but the position we remember should be the exact
   *  block being read. */
  function blocksAbove(probeY: number): { block: number | null; heading: number | null } {
    if (!container || lineIndex.length === 0) return { block: null, heading: null };
    let block: number | null = lineIndex[0].from;
    for (const b of lineIndex) {
      if (b.el.getBoundingClientRect().top <= probeY) block = b.from;
      else break;
    }
    let heading: number | null = null;
    for (const h of headingIndex) {
      if (h.el.getBoundingClientRect().top <= probeY) heading = h.line;
      else break;
    }
    return { block, heading };
  }

  /** What sits at the very top of the viewport. This is the *resume* position:
   *  a mark is restored with `scrollBlockToTop`, so it has to name the block
   *  that was at the top, not the one that was being read. */
  function topOfViewport(): { block: number | null; heading: number | null } {
    if (!container) return { block: null, heading: null };
    return blocksAbove(container.getBoundingClientRect().top + 12);
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
    const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
    beginProgrammaticScroll();
    container.scrollTo({
      top: Math.max(0, container.scrollTop + delta - 12),
      behavior: smooth ? "smooth" : "auto",
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

  function updateRibbonGeometry() {
    if (!container || !resumeMark) {
      ribbonResolved = false;
      return;
    }
    const el = blockForLine(resumeMark.line);
    if (!el) {
      ribbonResolved = false;
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    // offsetTop is exact here: `.viewer` is position:relative, so it is the
    // offsetParent of the content blocks.
    ribbonTop = el.offsetTop;
    ribbonResolved = true;
    ribbonInView = elRect.top >= containerRect.top - 4 && elRect.top <= containerRect.bottom;
    const trackTop = ribbonTop;
    const fraction = container.scrollHeight > 0 ? trackTop / container.scrollHeight : 0;
    edgeTop = containerRect.top + Math.min(Math.max(fraction, 0.02), 0.98) * containerRect.height;
    edgeRight = Math.max(8, window.innerWidth - containerRect.right + 16);
  }

  function publishNav() {
    if (!container) return;
    const view = container.clientHeight;
    const fraction = readingFraction();
    const { block, heading } = blocksAbove(
      container.getBoundingClientRect().top + fraction * view,
    );
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
      updateRibbonGeometry();
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

  /** Outline entries call in through the view-nav store. */
  const unregisterScroller = viewNav.registerScroller((line, opts) => {
    const el = blockForLine(line);
    if (el) scrollBlockToTop(el, opts?.smooth ?? true);
  });

  function jumpToResume() {
    if (resumeMark) applyMark(resumeMark, true);
  }

  function dismissRibbon() {
    if (tabId) onDismissResume?.(tabId);
  }

  onDestroy(() => {
    unregisterScroller();
    flushMark();
    if (navRaf) cancelAnimationFrame(navRaf);
    if (programmaticTimer) clearTimeout(programmaticTimer);
    if (freshTimer) clearTimeout(freshTimer);
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
          ribbonFresh = true;
          if (freshTimer) clearTimeout(freshTimer);
          freshTimer = setTimeout(() => { ribbonFresh = false; }, 5200);
          if (tab) onResumeApplied?.(tab);
        }
        updateRibbonGeometry();
        publishNav();

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
    if (!anchor) return;
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
  class:full-width={settings.s.fullWidth}
  class:center-headings={settings.s.centerHeadings}
  style="--zoom: {settings.s.zoom}; --font-size: {settings.s.fontSize}px; --font-family: {settings.s.fontFamily}; --content-width: {settings.s.contentWidthCh}ch;"
  bind:this={container}
  onscroll={onScroll}
>
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

  <ResumeRibbon
    show={ribbonVisible}
    top={ribbonTop}
    inView={ribbonInView}
    {edgeTop}
    {edgeRight}
    fresh={ribbonFresh}
    onJump={jumpToResume}
    onDismiss={dismissRibbon}
  />
</div>

<style>
  /* Outer scroll container — full width of the parent flex slot.
     position:relative makes it the offsetParent for content blocks, which is
     what lets the resume ribbon and the live-follow maths use offsetTop
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
     +page.svelte's palette and in ResumeRibbon) because it is not guaranteed
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
    /* Wide tables take their natural width and scroll; narrow ones still
       fill the column. */
    width: max-content;
    min-width: 100%;
  }
  .viewer :global(th),
  .viewer :global(td) {
    border: 0;
    border-bottom: 1px solid var(--border);
    padding: .55em .85em;
    text-align: start;
    vertical-align: top;
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
