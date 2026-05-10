import { LazyStore } from "@tauri-apps/plugin-store";

export type ThemeMode = "auto" | "light" | "dark";

export interface AppSettings {
  zoom: number;
  fontSize: number;
  fontFamily: string;
  theme: ThemeMode;
  contentWidthCh: number;   // continuous: chars-wide cap on content (40..160)
  fullWidth: boolean;       // ignore contentWidthCh, use viewport
  centerHeadings: boolean;  // opt-in: center h1-h6 (resumes / formal docs)
  // Experimental — persistent accent on AI-edited regions + pulse. Off by
  // default; surfaces a toolbar button + Ctrl+L only when enabled.
  experimentalLiveTrack: boolean;
  // Experimental — diff highlighting + smart-diff "Why?" summary button.
  // Off by default; surfaces a 🔍 Diff toolbar button + Ctrl+D only when enabled.
  experimentalDiffMode: boolean;
  // Legacy. Kept for one release as migration sources for the experimental
  // flags above. TODO(0.3): remove.
  liveTrack: boolean;
  diffMode: boolean;
  // Default editor sub-mode when entering edit/split: WYSIWYG smart editor
  // (Milkdown), or raw markdown source (CodeMirror). v1 default = "smart".
  editorMode: "smart" | "raw";
  anthropicApiKey: string;  // for smart-diff (LLM-summarised changes); empty = feature disabled
  anthropicModel: string;   // override model for smart-diff
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
  experimentalLiveTrack: false,
  experimentalDiffMode: false,
  liveTrack: false,
  diffMode: false,
  editorMode: "smart",
  anthropicApiKey: "",
  anthropicModel: "claude-haiku-4-5",
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

    // Migration: promote legacy `liveTrack` / `diffMode` flags to their
    // experimental counterparts when the new key isn't yet persisted. Existing
    // users who enabled either feature keep it; default new installs stay opted-out.
    const persistedExpLive = await this.store.get<boolean>("experimentalLiveTrack");
    if (persistedExpLive === undefined || persistedExpLive === null) {
      if (this.s.liveTrack) {
        this.s.experimentalLiveTrack = true;
        await this.store.set("experimentalLiveTrack", true);
      }
    }
    const persistedExpDiff = await this.store.get<boolean>("experimentalDiffMode");
    if (persistedExpDiff === undefined || persistedExpDiff === null) {
      if (this.s.diffMode) {
        this.s.experimentalDiffMode = true;
        await this.store.set("experimentalDiffMode", true);
      }
    }

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
  if (theme === "light") return false;
  return typeof window !== "undefined"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}
