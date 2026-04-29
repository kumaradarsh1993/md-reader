import { api } from "./api";
import { settings } from "./settings-store.svelte";

export interface Tab {
  id: string;
  path: string;
  source: string;
  dirty: boolean;
  scrollPos: number;
  /** Bumped each time the file changes on disk so the Viewer can live-follow. */
  diskTick: number;
}

function newId(): string {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class TabsStore {
  tabs = $state<Tab[]>([]);
  activeId = $state<string | null>(null);

  get active(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null;
  }

  /** Open a file. If already open, focus it. Returns the tab. */
  async openOrFocus(path: string): Promise<Tab> {
    const existing = this.tabs.find((t) => t.path === path);
    if (existing) {
      this.activeId = existing.id;
      return existing;
    }
    const file = await api.openFile(path);
    const tab: Tab = {
      id: newId(),
      path: file.path,
      source: file.content,
      dirty: false,
      scrollPos: 0,
      diskTick: 0,
    };
    this.tabs = [...this.tabs, tab];
    this.activeId = tab.id;
    await settings.pushRecent(file.path);
    this.persist();
    return tab;
  }

  close(id: string) {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const next = this.tabs.filter((t) => t.id !== id);
    this.tabs = next;
    if (this.activeId === id) {
      // prefer the tab to the right; fallback to left; else null
      const replacement = next[idx] ?? next[idx - 1] ?? null;
      this.activeId = replacement?.id ?? null;
    }
    this.persist();
  }

  closeAll() {
    this.tabs = [];
    this.activeId = null;
    this.persist();
  }

  switchTo(id: string) {
    if (this.tabs.some((t) => t.id === id)) {
      this.activeId = id;
      this.persist();
    }
  }

  next() {
    if (this.tabs.length < 2 || !this.activeId) return;
    const idx = this.tabs.findIndex((t) => t.id === this.activeId);
    this.activeId = this.tabs[(idx + 1) % this.tabs.length].id;
    this.persist();
  }

  prev() {
    if (this.tabs.length < 2 || !this.activeId) return;
    const idx = this.tabs.findIndex((t) => t.id === this.activeId);
    this.activeId = this.tabs[(idx - 1 + this.tabs.length) % this.tabs.length].id;
    this.persist();
  }

  reorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= this.tabs.length || toIndex >= this.tabs.length) return;
    const next = [...this.tabs];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    this.tabs = next;
    this.persist();
  }

  /** Update active tab's in-memory source (from in-app editing). Marks dirty. */
  setActiveSource(s: string) {
    const t = this.active;
    if (!t) return;
    if (t.source === s) return;
    t.source = s;
    t.dirty = true;
  }

  /** Update active tab's source from disk reload (does NOT mark dirty). */
  setActiveSourceFromDisk(s: string) {
    const t = this.active;
    if (!t) return;
    t.source = s;
    t.dirty = false;
    t.diskTick = Date.now();
  }

  setActiveScrollPos(pos: number) {
    const t = this.active;
    if (t) t.scrollPos = pos;
  }

  markActiveSaved() {
    const t = this.active;
    if (t) t.dirty = false;
  }

  /** Restore on launch from settings. Filters out files that no longer exist. */
  async restore() {
    const paths = settings.s.openTabs ?? [];
    const activePath = settings.s.activeTabPath ?? null;
    for (const p of paths) {
      try {
        const file = await api.openFile(p);
        this.tabs = [
          ...this.tabs,
          {
            id: newId(),
            path: file.path,
            source: file.content,
            dirty: false,
            scrollPos: 0,
            diskTick: 0,
          },
        ];
      } catch { /* file moved/deleted — skip */ }
    }
    if (activePath) {
      const t = this.tabs.find((tab) => tab.path === activePath);
      if (t) this.activeId = t.id;
    }
    if (!this.activeId && this.tabs.length > 0) {
      this.activeId = this.tabs[0].id;
    }
  }

  private persist() {
    settings.set("openTabs", this.tabs.map((t) => t.path));
    settings.set("activeTabPath", this.active?.path ?? null);
  }
}

export const tabs = new TabsStore();

export function tabName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
