import { LazyStore } from "@tauri-apps/plugin-store";
import { api, type SecretProvider } from "./api";

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
/**
 * 76ch ≈ 68 average characters of Latin text, which sits inside the 45–75
 * band typography has agreed on for continuous reading.
 *
 * The old 86 read as "86 characters" but delivered ~95: `ch` is the advance
 * of the digit `0`, about 15% wider than the average lowercase glyph. It also
 * silently included the column's gutter until v0.7.0, so the true measure
 * drifted as the window resized.
 */
export const WIDTH_DEFAULT = 76;

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

type SecretSettingKey = "anthropicApiKey" | "groqApiKey";

const SECRET_PROVIDERS: Record<SecretSettingKey, SecretProvider> = {
  anthropicApiKey: "anthropic",
  groqApiKey: "groq",
};

function isSecretSettingKey(key: keyof AppSettings): key is SecretSettingKey {
  return key === "anthropicApiKey" || key === "groqApiKey";
}

// plugin-store defaults must never materialise secret fields in settings.json.
const PERSISTED_DEFAULTS = Object.fromEntries(
  Object.entries(DEFAULTS).filter(([key]) => !isSecretSettingKey(key as keyof AppSettings)),
) as Partial<AppSettings>;

class SettingsStore {
  s = $state<AppSettings>({ ...DEFAULTS });
  private store: LazyStore | null = null;
  private ready = false;

  async init() {
    if (this.ready) return;
    this.store = new LazyStore("settings.json", { autoSave: true, defaults: { ...PERSISTED_DEFAULTS } });
    try {
      for (const key of Object.keys(PERSISTED_DEFAULTS) as (keyof AppSettings)[]) {
        const v = await this.store.get<AppSettings[typeof key]>(key);
        if (v !== undefined && v !== null) {
          // @ts-expect-error narrow generic over union
          this.s[key] = v;
        }
      }
      await this.loadSecret("groqApiKey");
      await this.loadSecret("anthropicApiKey");
    } catch (e) {
      // A settings read failing is survivable — DEFAULTS are already in place,
      // so the app opens looking factory-fresh rather than not opening at all.
      // Letting this throw was worse than it sounds: `init()` is the first
      // await in onMount, so one bad read also skipped the file-drop listener,
      // the CLI file-open listener and session restore.
      console.error("[Fox MD] settings load failed; using defaults", e);
    }

    // (v0.2.x had a short-lived `experimentalLiveTrack` / `experimentalDiffMode`
    // migration pair. Both are gone in v0.3.0 — the whole feature is being
    // rebuilt as Live Edit Theatre in v0.4.0 behind `advancedLiveEditTheatre`.
    // Users with the legacy flags persisted simply have them ignored.)

    this.ready = true;
  }

  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    this.s[key] = value;
    if (isSecretSettingKey(key)) {
      await this.saveSecret(key, value as string);
      return;
    }
    await this.store?.set(key, value);
  }

  /**
   * Read from the OS keyring first. A plaintext value from an older release is
   * migrated opportunistically and deleted only after the secure write lands.
   * The `KeyringPending` marker distinguishes a genuine keyring failure from a
   * stale legacy value, including the important "delete this key" case.
   */
  private async loadSecret(key: SecretSettingKey) {
    if (!this.store) return;
    const provider = SECRET_PROVIDERS[key];
    const pendingKey = `${key}KeyringPending`;
    const legacy = await this.store.get<string>(key);
    const pending = await this.store.get<boolean>(pendingKey);

    if (pending && legacy !== undefined && legacy !== null) {
      try {
        await api.setSecret(provider, legacy);
        this.s[key] = legacy;
        await this.store.delete(key);
        await this.store.delete(pendingKey);
      } catch (e) {
        this.s[key] = legacy;
        console.warn("[Fox MD] OS keyring still unavailable; using the existing file fallback", e);
      }
      return;
    }

    try {
      const secure = await api.getSecret(provider);
      if (secure !== null) {
        this.s[key] = secure;
        if (legacy !== undefined) await this.store.delete(key);
        if (pending !== undefined) await this.store.delete(pendingKey);
        return;
      }

      if (legacy !== undefined && legacy !== null) {
        await api.setSecret(provider, legacy);
        this.s[key] = legacy;
        await this.store.delete(key);
      }
      if (pending !== undefined) await this.store.delete(pendingKey);
    } catch (e) {
      // A file fallback exists only when the keyring genuinely failed. Fresh
      // installs with no legacy value remain memory-only and write no secret.
      this.s[key] = legacy ?? "";
      console.warn("[Fox MD] OS keyring unavailable; using the plaintext fallback if present", e);
    }
  }

  private async saveSecret(key: SecretSettingKey, value: string) {
    if (!this.store) return;
    const pendingKey = `${key}KeyringPending`;
    try {
      await api.setSecret(SECRET_PROVIDERS[key], value);
      await this.store.delete(key);
      await this.store.delete(pendingKey);
    } catch (e) {
      // File storage is a last-resort fallback, never a parallel copy.
      await this.store.set(key, value);
      await this.store.set(pendingKey, true);
      console.warn("[Fox MD] OS keyring write failed; saved a recoverable file fallback", e);
    }
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
