import { LazyStore } from "@tauri-apps/plugin-store";

export type ThemeMode = "auto" | "light" | "dark" | "sepia";

/** v0.5.0+: which provider drives the sidebar's "✨ Summary" mode. */
export type LLMProvider = "groq" | "anthropic";

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
  recentFiles: string[];
  openTabs: string[];
  activeTabPath: string | null;
}

export const WIDTH_MIN = 40;
export const WIDTH_MAX = 160;
export const WIDTH_DEFAULT = 86;

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
