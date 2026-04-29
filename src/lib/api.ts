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

export const api = {
  openFile: (path: string) => invoke<OpenedFile>("open_file", { path }),
  saveFile: (path: string, content: string) =>
    invoke<void>("save_file", { path, content }),
  renderMarkdown: (source: string, dark: boolean) =>
    invoke<string>("render_markdown", { source, dark }),
  watchFile: (path: string) => invoke<void>("watch_file", { path }),
  unwatchFile: () => invoke<void>("unwatch_file"),
  listDir: (path: string) => invoke<DirEntry[]>("list_dir", { path }),
  parentOf: (path: string) => invoke<string | null>("parent_of", { path }),

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
};
