import type { IconName } from "./Icon.svelte";

/**
 * App-wide right-click menus.
 *
 * Until v0.7 right-clicking anywhere in md-reader produced the WebView's own
 * page menu — "Back / Reload / Save as / Print / Inspect". That menu is a
 * browser's menu, and every entry on it is either meaningless in a document
 * reader or actively wrong ("Save as" would have offered to save the app's
 * HTML shell). It was the clearest tell that this is a web view wearing a
 * desktop app's clothes.
 *
 * The replacement is one store plus one renderer: any component calls
 * `contextMenu.open(event, items)` and gets a native-feeling menu positioned
 * at the cursor. Menus are built per-region — a tab knows about closing tabs,
 * a file row knows about revealing files — so the menu always answers "what
 * can I do with *this*".
 */

export interface MenuItem {
  label: string;
  /** Leading glyph. Omit for items in a group where most have no icon. */
  icon?: IconName;
  /** Right-aligned shortcut hint, already platform-formatted. */
  shortcut?: string;
  disabled?: boolean;
  /** Destructive styling (red) — closing many things at once, mostly. */
  danger?: boolean;
  /** Rendered with a check mark; use for toggles. */
  checked?: boolean;
  /**
   * Return value is ignored — typed as `unknown` rather than `void` so
   * builders can pass a one-expression arrow straight through
   * (`() => copyText(p)` returns a `Promise<boolean>`) without every call site
   * needing a block body just to discard it.
   */
  action: () => unknown;
}

export interface MenuSeparator {
  separator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

export const isSeparator = (e: MenuEntry): e is MenuSeparator =>
  (e as MenuSeparator).separator === true;

class ContextMenuStore {
  open_ = $state(false);
  x = $state(0);
  y = $state(0);
  items = $state<MenuEntry[]>([]);

  get isOpen() {
    return this.open_;
  }

  /**
   * Show `items` at the pointer. Callers pass the raw event so this can both
   * position the menu and suppress the WebView's own menu in one place —
   * forgetting the `preventDefault()` was the obvious footgun otherwise.
   *
   * Entries are filtered for emptiness here rather than at every call site,
   * so builders are free to emit conditional items as `...(cond ? [x] : [])`
   * without worrying about leaving a dangling separator behind.
   */
  open(e: MouseEvent, items: MenuEntry[]) {
    e.preventDefault();
    e.stopPropagation();
    const cleaned = tidy(items);
    if (cleaned.length === 0) return;
    this.items = cleaned;
    this.x = e.clientX;
    this.y = e.clientY;
    this.open_ = true;
  }

  close() {
    this.open_ = false;
    this.items = [];
  }
}

/**
 * Drop leading, trailing and doubled separators. Builders assemble menus from
 * conditional fragments, so these turn up constantly and a menu that opens
 * with a horizontal rule looks broken.
 */
function tidy(items: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const it of items) {
    if (isSeparator(it)) {
      if (out.length === 0) continue;
      if (isSeparator(out[out.length - 1])) continue;
    }
    out.push(it);
  }
  while (out.length && isSeparator(out[out.length - 1])) out.pop();
  return out;
}

export const contextMenu = new ContextMenuStore();

/** Convenience for the common `oncontextmenu` shape. */
export const menuHandler =
  (build: () => MenuEntry[]) =>
  (e: MouseEvent) =>
    contextMenu.open(e, build());
