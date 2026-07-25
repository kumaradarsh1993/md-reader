import { api } from "./api";
import { settings, type ScrollMark } from "./settings-store.svelte";
import type { Turn, TheatrePhase, SelectedView, FreshRange } from "./theatre/types";
import {
  onBeforeExternalEdit,
  onAfterExternalEdit,
  disposeTab as disposeTheatreForTab,
} from "./theatre/store.svelte";

export interface Tab {
  id: string;
  path: string;
  source: string;
  /** Snapshot of source taken when the tab opened. Diff mode visualises changes
   *  against this; reset via "Reset diff baseline" in the File menu. */
  baselineSource: string;
  dirty: boolean;
  /** Bumped each time the file changes on disk so the Viewer can live-follow. */
  diskTick: number;

  // ─── Reading position (v0.6.0+) ─────────────────────────────────────────
  /** Where this tab is scrolled to right now. Owned by the Viewer, which
   *  writes it on scroll and reads it back when the tab regains focus —
   *  that's what stops tab A's position from leaking into tab B. */
  scrollMark: ScrollMark | null;
  /** The position this file was left at in a *previous* session, if any.
   *  Kept separate from `scrollMark` so the resume ribbon knows which line to
   *  mark even after the reader has scrolled away from it. */
  resumeMark: ScrollMark | null;
  /** True once the ribbon has been shown and dismissed (or scrolled past) —
   *  it should announce itself once per open, not once per re-render. */
  resumeDismissed: boolean;
  /** Set by the Viewer after it has applied `resumeMark` on first render, so
   *  a re-render (theme flip, external edit) doesn't yank the reader back. */
  resumeApplied: boolean;

  // ─── Live Edit Theatre state (v0.4.0+, in-memory only) ──────────────────
  /** Theatre state machine phase for this tab. Default "off". */
  theatrePhase: TheatrePhase;
  /** Ring buffer of completed AI turns, newest first, capped at 10. */
  turns: Turn[];
  /** Source snapshot taken at the moment the current turn started. Lives
   *  between phases "engaging" / "engaged" / "done"; nulled at "off". */
  pendingTurnBefore: string | null;
  /** Which view the diff sidebar is showing. "live" means the in-flight turn;
   *  a number is a completed turn ID; "since-open" is current vs baselineSource. */
  selectedView: SelectedView;
  /** Sidebar open/closed. Persists across tab switches per-tab. */
  sidebarOpen: boolean;
  /** True after the user clicks the X on the post-dismiss highlight chip —
   *  highlights are hidden. */
  highlightsHidden: boolean;
  /** True after the user dismisses the discoverability tip for this tab.
   *  Prevents re-showing on every external edit. */
  tipDismissed: boolean;
  /** v0.5.0+: source snapshot taken at the *previous* external-edit tick,
   *  used to compute delta-since-last-edit ranges. Distinct from
   *  pendingTurnBefore (which is per-turn baseline). */
  previousSourceForDelta: string | null;
  /** v0.5.0+: line ranges changed in the most recent edit tick(s), each with
   *  a timestamp. A decay loop promotes ranges older than ~1500ms out of this
   *  list — at which point they're rendered yellow via the regular
   *  theatreRanges path instead of green. */
  freshRanges: FreshRange[];
}

/** Reading-position fields for a freshly-opened tab. A mark stored from a
 *  previous session becomes both the starting position and the ribbon anchor. */
function freshScrollState(path: string): Pick<
  Tab,
  "scrollMark" | "resumeMark" | "resumeDismissed" | "resumeApplied"
> {
  const remembered = settings.scrollMarkFor(path);
  return {
    scrollMark: remembered,
    // Only offer to mark the spot when it's meaningfully into the document —
    // a ribbon two lines from the top is noise, not a service.
    resumeMark: remembered && remembered.ratio > 0.02 ? remembered : null,
    resumeDismissed: false,
    resumeApplied: false,
  };
}

function newId(): string {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Default theatre fields for a newly-created tab. Stripped out of openOrFocus
 *  and restore to keep those paths readable. All fields are in-memory only. */
function freshTheatreState(): Pick<
  Tab,
  "theatrePhase" | "turns" | "pendingTurnBefore" | "selectedView" | "sidebarOpen" | "highlightsHidden" | "tipDismissed" | "previousSourceForDelta" | "freshRanges"
> {
  return {
    theatrePhase: "off",
    turns: [],
    pendingTurnBefore: null,
    selectedView: "live",
    sidebarOpen: false,
    highlightsHidden: false,
    tipDismissed: false,
    previousSourceForDelta: null,
    freshRanges: [],
  };
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
      baselineSource: file.content,
      dirty: false,
      diskTick: 0,
      ...freshScrollState(file.path),
      ...freshTheatreState(),
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
    disposeTheatreForTab(id);
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
    if (t.source === s) return; // no-op, don't trigger theatre
    // Theatre hook: notify the state machine before/after the source flips so
    // it can capture pendingTurnBefore and arm/reset the idle debounce.
    onBeforeExternalEdit(t);
    t.source = s;
    t.dirty = false;
    t.diskTick = Date.now();
    onAfterExternalEdit(t);
  }

  /** Record the reading position for a tab (by id, not "active" — a scroll
   *  event can land just after the user switched tabs). Also persists it
   *  against the file path so the next session resumes here. */
  setScrollMark(tabId: string, mark: ScrollMark) {
    const t = this.tabs.find((x) => x.id === tabId);
    if (!t) return;
    t.scrollMark = mark;
    settings.rememberScrollMark(t.path, mark);
  }

  /** Stop showing the resume ribbon for this tab. */
  dismissResume(tabId: string) {
    const t = this.tabs.find((x) => x.id === tabId);
    if (t) t.resumeDismissed = true;
  }

  markResumeApplied(tabId: string) {
    const t = this.tabs.find((x) => x.id === tabId);
    if (t) t.resumeApplied = true;
  }

  markActiveSaved() {
    const t = this.active;
    if (t) t.dirty = false;
  }

  /** Snap the diff baseline to the current source — "from now, this is the
   *  reference point for diff highlighting." */
  resetActiveBaseline() {
    const t = this.active;
    if (t) t.baselineSource = t.source;
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
            baselineSource: file.content,
            dirty: false,
            diskTick: 0,
            ...freshScrollState(file.path),
            ...freshTheatreState(),
          },
        ];
      } catch { /* file moved/deleted — skip */ }
    }
    // Defensive: only set activeId if nothing else has already claimed it.
    // A concurrent code path (e.g. take_initial_files → openOrFocus) may have
    // set activeId to a CLI-passed file while we were still looping; we must
    // not clobber that with the previous session's last-active path.
    if (!this.activeId) {
      if (activePath) {
        const t = this.tabs.find((tab) => tab.path === activePath);
        if (t) this.activeId = t.id;
      }
      if (!this.activeId && this.tabs.length > 0) {
        this.activeId = this.tabs[0].id;
      }
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
