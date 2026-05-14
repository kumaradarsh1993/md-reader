<script lang="ts">
  /**
   * Word-comments-style leader lines: a thin vertical bracket on the right
   * edge of each changed paragraph in the viewer, plus a cubic bezier curve
   * from the bracket midpoint to the corresponding card's left edge in the
   * diff sidebar.
   *
   * Repositions on:
   *  - main viewer scroll (paragraphs move)
   *  - sidebar body scroll (cards move)
   *  - window resize
   *  - section list changes (new turn arrives, or selected view flips)
   *
   * Implementation note: the SVG is a viewport-fixed overlay. Both paragraph
   * and card positions are read via getBoundingClientRect, which is naturally
   * viewport-relative. No coordinate gymnastics needed.
   *
   * v0.5.0+.
   */
  import type { Section } from "./diff-engine";

  interface Props {
    /** Current section list from the active sidebar view. */
    sections: Section[];
    /** Which sidebar view we're connecting from — used to invalidate paths
     *  when the user picks a different turn (re-keys the card list). */
    viewKey: string | number;
  }
  let { sections, viewKey }: Props = $props();

  interface ConnectorPath {
    key: string;
    bracketD: string;
    curveD: string;
    color: string;
  }

  let paths = $state<ConnectorPath[]>([]);
  let rafHandle = 0;

  function schedule() {
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = 0;
      compute();
    });
  }

  function colorFor(kind: Section["changeKind"]): string {
    if (kind === "added") return "#3fb950";
    if (kind === "removed") return "#f85149";
    return "rgba(150, 150, 150, 0.55)";
  }

  function findParagraph(viewer: HTMLElement, line: number): HTMLElement | null {
    const els = viewer.querySelectorAll<HTMLElement>("[data-sourcepos]");
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

  function compute() {
    const viewer = document.querySelector<HTMLElement>(".content");
    const sidebar = document.querySelector<HTMLElement>(".diff-sidebar");
    if (!viewer || !sidebar) {
      paths = [];
      return;
    }
    const viewerRect = viewer.getBoundingClientRect();
    const sidebarBody = sidebar.querySelector<HTMLElement>(".body");
    const sidebarBodyRect = sidebarBody?.getBoundingClientRect() ?? sidebar.getBoundingClientRect();
    const cards = sidebar.querySelectorAll<HTMLElement>("[data-card-section-index]");
    // Brackets all sit on a vertical guide just inside the viewer's right
    // edge — gives a clean column of leader-line origins regardless of
    // paragraph width.
    const bracketX = viewerRect.right - 6;

    const result: ConnectorPath[] = [];
    for (const card of cards) {
      const idx = +(card.dataset.cardSectionIndex ?? "-1");
      const section = sections[idx];
      if (!section) continue;
      if (section.startLineAfter <= 0) continue;
      const para = findParagraph(viewer, section.startLineAfter);
      if (!para) continue;

      const paraRect = para.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();

      // Skip if either end is outside its scroll container — drawing a curve
      // to a clipped card produces a confusing line going into the sidebar's
      // header or chrome.
      const paraVisible =
        paraRect.bottom > viewerRect.top + 4 && paraRect.top < viewerRect.bottom - 4;
      const cardVisible =
        cardRect.bottom > sidebarBodyRect.top + 4 &&
        cardRect.top < sidebarBodyRect.bottom - 4;
      if (!paraVisible || !cardVisible) continue;

      // Clip the bracket's vertical extent to the viewer's visible band so a
      // partially-scrolled paragraph still shows a partial bracket.
      const top = Math.max(paraRect.top, viewerRect.top + 4);
      const bottom = Math.min(paraRect.bottom, viewerRect.bottom - 4);
      if (bottom - top < 6) continue;

      const bracketD = `M ${bracketX} ${top} L ${bracketX} ${bottom}`;

      const sourceX = bracketX;
      const sourceY = (top + bottom) / 2;
      const targetX = cardRect.left - 2;
      const targetY = Math.min(
        Math.max(cardRect.top + 14, sidebarBodyRect.top + 8),
        sidebarBodyRect.bottom - 8,
      );
      // Symmetric horizontal control points → smooth S-curve.
      const cpDX = Math.max(20, (targetX - sourceX) * 0.5);
      const curveD = `M ${sourceX} ${sourceY} C ${sourceX + cpDX} ${sourceY}, ${targetX - cpDX} ${targetY}, ${targetX} ${targetY}`;

      result.push({
        key: `${idx}-${section.heading}`,
        bracketD,
        curveD,
        color: colorFor(section.changeKind),
      });
    }
    paths = result;
  }

  // Recompute whenever the section list or the selected view changes.
  $effect(() => {
    sections;
    viewKey;
    schedule();
  });

  // Wire scroll / resize listeners. The sidebar body element doesn't exist
  // until after first paint, so query inside the effect (it'll re-run if
  // sidebarOpen state changes and forces a re-mount).
  $effect(() => {
    const viewer = document.querySelector(".content");
    const sidebar = document.querySelector(".diff-sidebar");
    const sidebarBody = sidebar?.querySelector(".body");
    const onAny = () => schedule();
    viewer?.addEventListener("scroll", onAny, { passive: true });
    sidebarBody?.addEventListener("scroll", onAny, { passive: true });
    window.addEventListener("resize", onAny);
    // A low-frequency tick catches DOM mutations that don't fire scroll —
    // e.g. new external edits adding paragraphs, theme/font changes shifting
    // line heights, mermaid diagrams finishing async layout.
    const tick = setInterval(schedule, 400);
    schedule();
    return () => {
      viewer?.removeEventListener("scroll", onAny);
      sidebarBody?.removeEventListener("scroll", onAny);
      window.removeEventListener("resize", onAny);
      clearInterval(tick);
      if (rafHandle) cancelAnimationFrame(rafHandle);
    };
  });
</script>

<svg class="connectors" aria-hidden="true">
  {#each paths as p (p.key)}
    <path class="bracket" d={p.bracketD} stroke={p.color} />
    <path class="curve" d={p.curveD} stroke={p.color} />
  {/each}
</svg>

<style>
  .connectors {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 5;
    overflow: visible;
  }
  /* Svelte's scoped CSS doesn't reach SVG <path> children rendered inside
     {#each}, so :global is needed. */
  .connectors :global(.bracket) {
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    opacity: 0.7;
  }
  .connectors :global(.curve) {
    fill: none;
    stroke-width: 1.1;
    opacity: 0.55;
  }
</style>
