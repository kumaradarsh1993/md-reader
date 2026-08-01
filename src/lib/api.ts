import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export interface OpenedFile {
  path: string;
  content: string;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_md: boolean;
}

export type SecretProvider = "groq" | "anthropic";

export const api = {
  openFile: (path: string) => invoke<OpenedFile>("open_file", { path }),
  saveFile: (path: string, content: string) =>
    invoke<void>("save_file", { path, content }),
  /** `theme` is the resolved palette name: "light" | "dark" | "sepia". */
  renderMarkdown: (source: string, theme: string) =>
    invoke<string>("render_markdown", { source, theme }),
  watchFile: (path: string) => invoke<void>("watch_file", { path }),
  unwatchFile: () => invoke<void>("unwatch_file"),
  listDir: (path: string) => invoke<DirEntry[]>("list_dir", { path }),
  parentOf: (path: string) => invoke<string | null>("parent_of", { path }),
  isTornOutWindow: () => invoke<boolean>("is_torn_out_window"),
  takeInitialFiles: () => invoke<string[]>("take_initial_files"),
  getSecret: (provider: SecretProvider) =>
    invoke<string | null>("get_secret", { provider }),
  setSecret: (provider: SecretProvider, value: string) =>
    invoke<void>("set_secret", { provider, value }),

  pickFile: async (): Promise<string | null> => {
    const result = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "mkdn"] },
      ],
    });
    return typeof result === "string" ? result : null;
  },

  onFileChanged: (handler: (path: string) => void): Promise<UnlistenFn> =>
    listen<string>("file-changed", (e) => handler(e.payload)),

  onOpenFromCli: (handler: (paths: string[]) => void): Promise<UnlistenFn> =>
    listen<string[]>("open-file-from-cli", (e) => handler(e.payload)),

  onOpenFileEvent: (handler: (path: string) => void): Promise<UnlistenFn> =>
    listen<string>("md-reader://open-file", (e) => handler(e.payload)),
};
