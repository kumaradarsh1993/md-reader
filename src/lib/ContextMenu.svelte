<script lang="ts">
  import { contextMenu, isSeparator } from "./context-menu.svelte";
  import Icon from "./Icon.svelte";

  /** Mounted once, at the root. Renders whatever the store is holding. */

  let menuEl = $state<HTMLElement | null>(null);
  /** Resolved after measuring — see the flip effect below. */
  let pos = $state({ left: 0, top: 0 });
  let placed = $state(false);

  const EDGE = 8;

  // Position is resolved *after* the menu is in the DOM, because flipping
  // needs its real height and that depends on the item count and the user's
  // font. Rendering at the raw cursor point first and correcting on the next
  // frame would show a visible jump, so the menu stays invisible (not
  // display:none — it has to be measurable) until this runs.
  $effect(() => {
    if (!contextMenu.isOpen) {
      placed = false;
      return;
    }
    const el = menuEl;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = contextMenu.x;
    let top = contextMenu.y;

    // Prefer flipping to the other side of the cursor; only clamp when the
    // menu genuinely cannot fit either way.
    if (left + width + EDGE > vw) left = contextMenu.x - width;
    if (left < EDGE) left = Math.min(EDGE, Math.max(0, vw - width - EDGE));
    if (top + height + EDGE > vh) top = contextMenu.y - height;
    if (top < EDGE) top = EDGE;

    pos = { left, top };
    placed = true;
  });

  async function run(item: { action: () => unknown }) {
    contextMenu.close();
    try {
      await item.action();
    } catch (err) {
      console.error("[Fox MD] context menu action failed", err);
    }
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape" && contextMenu.isOpen) {
      e.stopPropagation();
      contextMenu.close();
    }
  }
</script>

<svelte:window
  on:keydown|capture={onWindowKey}
  on:resize={() => contextMenu.close()}
  on:blur={() => contextMenu.close()}
/>

{#if contextMenu.isOpen}
  <!-- Backdrop closes on any press, including a right-press: right-clicking
       elsewhere should move the menu, not stack a second one. `pointerdown`
       rather than `click` so the dismissal feels immediate. -->
  <div
    class="cm-backdrop"
    role="presentation"
    onpointerdown={() => contextMenu.close()}
    oncontextmenu={(e) => { e.preventDefault(); contextMenu.close(); }}
    onwheel={() => contextMenu.close()}
  ></div>

  <div
    class="cm"
    class:placed
    bind:this={menuEl}
    style="left: {pos.left}px; top: {pos.top}px"
    role="menu"
    tabindex="-1"
  >
    {#each contextMenu.items as item, i (i)}
      {#if isSeparator(item)}
        <div class="cm-sep" role="separator"></div>
      {:else}
        <button
          class="cm-item"
          class:danger={item.danger}
          role="menuitem"
          disabled={item.disabled}
          onclick={() => run(item)}
        >
          <span class="cm-glyph">
            {#if item.checked}
              <Icon name="check" size={13} />
            {:else if item.icon}
              <Icon name={item.icon} size={13} />
            {/if}
          </span>
          <span class="cm-label">{item.label}</span>
          {#if item.shortcut}
            <span class="cm-shortcut">{item.shortcut}</span>
          {/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .cm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 900;
    background: transparent;
  }
  .cm {
    position: fixed;
    z-index: 901;
    min-width: 208px;
    max-width: 320px;
    padding: 5px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    /* Invisible until the flip maths has run — see the effect above. */
    opacity: 0;
    transform: scale(.97);
    transform-origin: top left;
    transition: opacity 90ms ease, transform 90ms cubic-bezier(.2, .8, .3, 1);
    pointer-events: none;
  }
  .cm.placed {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
  .cm-item {
    display: flex;
    align-items: center;
    gap: .5rem;
    width: 100%;
    height: 28px;
    padding: 0 .5rem;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--fg);
    font: inherit;
    font-size: 13px;
    /* NOT 1. `.cm-label` is `overflow: hidden` for its ellipsis, and a line
       box exactly as tall as the font has nowhere to put a descender — so
       every p, y, g and j in the menu was sliced off at the stem ("Copy
       folder path" being the one that made it obvious). The row's height is
       fixed at 28px above, so a normal line-height changes nothing else. */
    line-height: 1.4;
    text-align: left;
    cursor: default;
  }
  .cm-item:hover:not([disabled]) { background: var(--accent); color: #fff; }
  .cm-item:hover:not([disabled]) .cm-shortcut { color: rgba(255, 255, 255, .8); }
  .cm-item.danger { color: #e5484d; }
  .cm-item.danger:hover:not([disabled]) { background: #e5484d; color: #fff; }
  .cm-item[disabled] { opacity: .38; }
  .cm-item:focus-visible { outline: none; background: var(--hover-bg); }
  /* Reserved even when empty, so labels line up whether or not a group's
     items all carry icons. */
  .cm-glyph {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    flex-shrink: 0;
    opacity: .85;
  }
  .cm-label {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cm-shortcut {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--muted);
    margin-left: 1rem;
    font-variant-numeric: tabular-nums;
  }
  .cm-sep {
    height: 1px;
    background: var(--border);
    margin: 4px 6px;
  }

  @media (prefers-reduced-motion: reduce) {
    .cm { transition: none; }
  }
</style>
