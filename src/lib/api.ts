import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

export interface OpenedFile {
  path: string;
  content: string;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_md: boolean;
  /** Last-modified time, ms since the Unix epoch; null when unavailable. */
  modified: number | null;
}

export type SecretProvider = "groq" | "anthropic";

export const api = {
  openFile: (path: string) => invoke<OpenedFile>("open_file", { path }),
  saveFile: (path: string, content: string) =>
    invoke<void>("save_file", { path, content }),
  /** The OS account's name, as a first guess at who is commenting. */
  userDisplayName: () => invoke<string>("user_display_name"),
  /** Read a text file, or null when it is simply not there. */
  readTextFileOpt: (path: string) => invoke<string | null>("read_text_file_opt", { path }),
  /** Write a text file, creating parent directories. */
  writeTextFileMkdir: (path: string, content: string) =>
    invoke<void>("write_text_file_mkdir", { path, content }),
  /** Write only if nothing is there — never clobbers. */
  writeTextFileIfAbsent: (path: string, content: string) =>
    invoke<void>("write_text_file_if_absent", { path, content }),
  /** Delete a regular file if it exists; a no-op otherwise. */
  removeFileIfPresent: (path: string) => invoke<void>("remove_file_if_present", { path }),
  /** Read a file as base64. Used by the .docx exporter to embed images. */
  readFileBase64: (path: string) => invoke<string>("read_file_base64", { path }),
  /** Write raw bytes, given as base64. The .docx exporter's save path. */
  writeFileBase64: (path: string, data: string) =>
    invoke<void>("write_file_base64", { path, data }),
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

  /** Where to write an exported Word document. Returns null if cancelled. */
  pickDocxTarget: async (suggested: string): Promise<string | null> => {
    const result = await saveDialog({
      defaultPath: suggested,
      filters: [{ name: "Word document", extensions: ["docx"] }],
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
