import { LazyStore } from "@tauri-apps/plugin-store";

export type ThemeMode = "auto" | "light" | "dark" | "sepia";

/** v0.5.0+: which provider drives the sidebar's "✨ Summary" mode. */
export type LLMProvider = "groq" | "anthropic";

/**
 * v0.6.0+: where the user had scrolled to in a file, persisted across
 * sessions so reopening a document resumes reading in place.
 *
 * Two coordinates are stored because neither alone survives everything:
 *  - `line` is the 1-based source line of the top-most visible block. It's
 *    resilient to font-size / content-width / zoom changes and to edits
 *    *below* the reading position, which is the common case.
 *  - `ratio` (0..1 of scrollHeight) is the fallback when the anchor line no
 *    longer resolves to a DOM node (heavy edits, or a block that vanished).
 */
export interface ScrollMark {
  /** 1-based source line of the top-most visible block. */
  line: number;
  /** scrollTop / scrollHeight at the time of capture. */
  ratio: number;
  /** Wall-clock ms of capture — used to expire stale marks. */
  at: number;
}

/** Keep the persisted scroll map bounded; oldest marks are evicted first. */
export const SCROLL_MEMORY_CAP = 200;

export interface AppSettings {
  zoom: number;
  fontSize: number;
  fontFamily: string;
  theme: ThemeMode;
  contentWidthCh: number;   // continuous: chars-wide cap on content (40..160)
  fullWidth: boolean;       // ignore contentWidthCh, use viewport
  centerHeadings: boolean;  // opt-in: center h1-h6 (resumes / formal docs)
  // v0.3.0+: single "Advanced features" toggle that gates the Live Edit
  // Theatre experience (zoom-out + status bar + diff sidebar + LLM summary).
  // Off by default. In v0.3.0 nothing happens when enabled (a teaser hint
  // appears in Settings). v0.4.0 activates the full feature behind this flag.
  advancedLiveEditTheatre: boolean;
  // Legacy from v0.2.x — left here read-only so existing settings.json files
  // still load cleanly. None of these are written by any current UI path.
  // TODO(0.5): drop entirely.
  liveTrack: boolean;
  diffMode: boolean;
  // Default editor sub-mode when entering edit/split: WYSIWYG smart editor
  // (Milkdown), or raw markdown source (CodeMirror). v1 default = "smart".
  editorMode: "smart" | "raw";
  // ─── Smart-diff LLM provider settings (v0.5.0+) ──────────────────
  /** Which provider drives the sidebar's per-section LLM summary. Default
   *  "groq" since the Groq free tier covers this use case with no card. */
  llmProvider: LLMProvider;
  anthropicApiKey: string;  // for smart-diff (LLM-summarised changes); empty = feature disabled
  anthropicModel: string;   // override model for smart-diff
  /** Groq Cloud API key (https://console.groq.com). Free tier. */
  groqApiKey: string;
  /** Groq model ID. Default Llama 3.3 70B Versatile (free tier, best prose
   *  summary quality on Groq as of 2026-05). */
  groqModel: string;
  showToc: boolean;
  showFiles: boolean;
  panelWidth: number;
  // ─── Left pane layout (v0.6.0+) ──────────────────────────────────
  /** Whole-pane collapse, independent of which sections are enabled.
   *  Collapsing keeps showFiles / showToc intact so expanding restores
   *  exactly what you had. */
  panelCollapsed: boolean;
  /** Vertical split between Files (top) and Outline (bottom) when both are
   *  visible — the Files share of the stack height, 0.15..0.85. */
  panelSplit: number;
  /** Hovering the window's left edge while collapsed slides the pane out as
   *  a temporary overlay, which retracts when the pointer leaves. */
  panelHoverPeek: boolean;
  // ─── Reading position memory (v0.6.0+) ───────────────────────────
  /** Remember scroll position per tab and across sessions. */
  rememberScroll: boolean;
  /** Show the subtle "you were here" ribbon after a resume. */
  resumeRibbon: boolean;
  /** Per-file-path reading positions. Bounded to SCROLL_MEMORY_CAP entries. */
  scrollMemory: Record<string, ScrollMark>;
  recentFiles: string[];
  openTabs: string[];
  activeTabPath: string | null;
}

export const WIDTH_MIN = 40;
export const WIDTH_MAX = 160;
export const WIDTH_DEFAULT = 86;

/** Left-pane width bounds — shared by the toolbar, LeftPanel and the resizer. */
export const PANEL_WIDTH_MIN = 180;
export const PANEL_WIDTH_MAX = 520;
/** Files/Outline split bounds, expressed as the Files share of the stack. */
export const PANEL_SPLIT_MIN = 0.15;
export const PANEL_SPLIT_MAX = 0.85;

const DEFAULTS: AppSettings = {
  zoom: 1.0,
  fontSize: 16,
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
  theme: "auto",
  contentWidthCh: WIDTH_DEFAULT,
  fullWidth: false,
  centerHeadings: false,
  advancedLiveEditTheatre: false,
  liveTrack: false,
  diffMode: false,
  editorMode: "smart",
  llmProvider: "groq",
  anthropicApiKey: "",
  anthropicModel: "claude-haiku-4-5",
  groqApiKey: "",
  groqModel: "llama-3.3-70b-versatile",
  showToc: true,
  showFiles: false,
  panelWidth: 280,
  panelCollapsed: false,
  panelSplit: 0.45,
  panelHoverPeek: true,
  rememberScroll: true,
  resumeRibbon: true,
  scrollMemory: {},
  recentFiles: [],
  openTabs: [],
  activeTabPath: null,
};

class SettingsStore {
  s = $state<AppSettings>({ ...DEFAULTS });
  private store: LazyStore | null = null;
  private ready = false;

  async init() {
    if (this.ready) return;
    this.store = new LazyStore("settings.json", { autoSave: true, defaults: { ...DEFAULTS } });
    for (const key of Object.keys(DEFAULTS) as (keyof AppSettings)[]) {
      const v = await this.store.get<AppSettings[typeof key]>(key);
      if (v !== undefined && v !== null) {
        // @ts-expect-error narrow generic over union
        this.s[key] = v;
      }
    }

    // (v0.2.x had a short-lived `experimentalLiveTrack` / `experimentalDiffMode`
    // migration pair. Both are gone in v0.3.0 — the whole feature is being
    // rebuilt as Live Edit Theatre in v0.4.0 behind `advancedLiveEditTheatre`.
    // Users with the legacy flags persisted simply have them ignored.)

    this.ready = true;
  }

  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    this.s[key] = value;
    await this.store?.set(key, value);
  }

  async pushRecent(path: string) {
    const next = [path, ...this.s.recentFiles.filter((p) => p !== path)].slice(0, 12);
    await this.set("recentFiles", next);
  }

  // ─── Reading-position memory (v0.6.0+) ─────────────────────────────
  //
  // Scroll marks arrive far too often to hand each one to `set()` (which hits
  // the plugin-store, and therefore the disk, on every call). The in-memory
  // map updates synchronously so the UI stays truthful; the disk write is
  // coalesced onto a trailing timer.
  private scrollFlushTimer: ReturnType<typeof setTimeout> | null = null;

  /** Record where the user is in `path`. Persisted on a trailing debounce. */
  rememberScrollMark(path: string, mark: ScrollMark) {
    if (!path) return;
    if (!this.s.rememberScroll) return;
    this.s.scrollMemory[path] = mark;
    this.scheduleScrollFlush();
  }

  /** Look up a previously-stored reading position for `path`. */
  scrollMarkFor(path: string): ScrollMark | null {
    if (!this.s.rememberScroll) return null;
    return this.s.scrollMemory[path] ?? null;
  }

  /** Forget one file's position (used when the user jumps to the top). */
  forgetScrollMark(path: string) {
    if (!(path in this.s.scrollMemory)) return;
    delete this.s.scrollMemory[path];
    this.scheduleScrollFlush();
  }

  /** Drop every stored reading position (Settings → "Forget positions"). */
  async clearScrollMemory() {
    this.s.scrollMemory = {};
    await this.set("scrollMemory", {});
  }

  /** Write any coalesced scroll positions out now. Called when the window is
   *  going away — otherwise closing the app within the debounce window would
   *  silently drop the last position, which is precisely the moment the user
   *  is counting on it being saved. */
  async flushPendingWrites() {
    if (this.scrollFlushTimer) {
      clearTimeout(this.scrollFlushTimer);
      this.scrollFlushTimer = null;
    }
    await this.flushScrollMemory();
    await this.store?.save();
  }

  private scheduleScrollFlush() {
    if (this.scrollFlushTimer) clearTimeout(this.scrollFlushTimer);
    this.scrollFlushTimer = setTimeout(() => {
      this.scrollFlushTimer = null;
      void this.flushScrollMemory();
    }, 600);
  }

  private async flushScrollMemory() {
    // Evict the oldest marks before writing so a long-lived install doesn't
    // grow settings.json without bound.
    const entries = Object.entries(this.s.scrollMemory);
    if (entries.length > SCROLL_MEMORY_CAP) {
      entries.sort((a, b) => b[1].at - a[1].at);
      this.s.scrollMemory = Object.fromEntries(entries.slice(0, SCROLL_MEMORY_CAP));
    }
    await this.store?.set("scrollMemory", { ...this.s.scrollMemory });
  }
}

export const settings = new SettingsStore();

export function effectiveDark(theme: ThemeMode): boolean {
  if (theme === "dark") return true;
  if (theme === "light" || theme === "sepia") return false;
  return typeof window !== "undefined"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

/**
 * Resolve the user's chosen theme to the concrete data-theme attribute value
 * applied to <html>. "auto" follows OS dark/light. Sepia is its own thing.
 *
 * The codebase's CSS variables key off this attribute (see :root and
 * html[data-theme="..."] blocks in +page.svelte), so picking the right value
 * here is what swaps the palette.
 */
export function effectiveThemeName(theme: ThemeMode): "light" | "dark" | "sepia" {
  if (theme === "sepia") return "sepia";
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
