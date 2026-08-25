<script lang="ts" module>
  /**
   * A single inline icon set, so the app stops rendering emoji as UI.
   *
   * Emoji were the v0.1–v0.6 stand-in for icons (📁 📑 ⚙ ⌕ ☀ ◐ ☾). They are
   * the single loudest "this is a hobby build" signal in the whole product:
   * every platform draws them in a different colour, at a different weight,
   * with its own baseline, and none of them can inherit `currentColor`. So a
   * "muted" toolbar button rendered as a full-saturation yellow folder.
   *
   * These are geometry in the Lucide idiom — 24×24 box, 2px stroke, round
   * caps and joins — inlined rather than pulled from a package. A reader app
   * needs about twenty glyphs; a dependency (and its tree-shaking questions,
   * and its licence file) buys nothing at that size. Everything here is
   * `stroke: currentColor`, so an icon is exactly as loud as the text next to
   * it and every theme gets it right for free.
   *
   * Stroke width is scaled against the rendered size — at 14px a flat 2px
   * stroke reads as a blob, so small icons thin out automatically.
   */
  export type IconName =
    | "panel-left"
    | "folder"
    | "folder-open"
    | "list-tree"
    | "search"
    | "settings"
    | "sun"
    | "contrast"
    | "moon"
    | "expand"
    | "shrink"
    | "plus"
    | "minus"
    | "x"
    | "chevron-down"
    | "chevron-right"
    | "file-text"
    | "arrow-up"
    | "arrow-up-to-line"
    | "copy"
    | "external-link"
    | "pencil"
    | "eye"
    | "refresh"
    | "check"
    | "bookmark"
    | "link"
    | "type"
    | "columns"
    | "info"
    | "sort-az"
    | "clock"
    | "file-page"
    | "pin";

  /**
   * Path geometry only — every icon inherits the same stroke presentation from
   * the <svg> element, so a glyph is one line of data rather than a component.
   */
  const PATHS: Record<IconName, string> = {
    "panel-left":
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    folder:
      '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    "folder-open":
      '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    "list-tree":
      '<path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    settings:
      '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    sun:
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    /* Half-filled disc — the universal "reading tint" mark. The fill is a
       separate closed path so it stays solid while the ring stays a stroke. */
    contrast:
      '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    expand:
      '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    shrink:
      '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "file-text":
      '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    "arrow-up-to-line": '<path d="M5 3h14"/><path d="m18 13-6-6-6 6"/><path d="M12 7v14"/>',
    copy:
      '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    "external-link":
      '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    eye:
      '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
    // Clockwise, arrowhead at the top *right* — the direction every browser's
    // reload button turns. The mirrored (counter-clockwise) form reads as
    // "undo" or "go back", which is not what refresh does.
    refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1.06 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    // A→Z with a down arrow: the standard "sorted alphabetically" mark.
    "sort-az": '<path d="m3 16 4 4 4-4"/><path d="M7 4v16"/><path d="M15 4h5l-5 6h5"/><path d="M15 20v-3.5a2.5 2.5 0 0 1 5 0V20"/><path d="M20 18h-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    // A sheet with a folded corner and text lines — the Word-preview toggle.
    "file-page": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    link:
      '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  };
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    /** Rendered box, in px. The stroke thins out below 18px automatically. */
    size?: number;
    /** Escape hatch for the rare glyph that needs a heavier or lighter line. */
    stroke?: number;
    class?: string;
  }
  let { name, size = 16, stroke, class: klass = "" }: Props = $props();

  // 2px is Lucide's design weight at 24px. Rendering the same 24-unit geometry
  // into a 15px box scales that stroke down to 1.25px, which turns to mush
  // once the platform rounds it to the device pixel grid — so the weight is
  // re-derived from the target size instead of inherited from the viewBox.
  let strokeWidth = $derived(stroke ?? (size <= 14 ? 2.1 : size <= 17 ? 1.9 : 1.75));
</script>

<svg
  class={klass}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>{@html PATHS[name]}</svg>

<style>
  svg {
    display: block;
    flex-shrink: 0;
    /* Optical alignment: stroke icons sit a hair high next to a text baseline
       because their geometry fills the box edge-to-edge while a lowercase
       glyph does not. */
    transform: translateY(0.5px);
  }
</style>
