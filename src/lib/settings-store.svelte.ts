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
  showToc: boolean;
  recentFiles: string[];
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
  showToc: true,
  recentFiles: [],
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
