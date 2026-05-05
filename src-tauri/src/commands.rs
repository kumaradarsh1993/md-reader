use std::cmp::Ordering;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::markdown;
use crate::watcher::WatcherState;

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_md: bool,
}

#[derive(Serialize)]
pub struct OpenedFile {
    pub path: String,
    pub content: String,
}

#[tauri::command]
pub fn open_file(path: String) -> Result<OpenedFile, String> {
    let p = Path::new(&path);
    let content = std::fs::read_to_string(p).map_err(|e| format!("read failed: {e}"))?;
    Ok(OpenedFile { path: path, content })
}

#[tauri::command]
pub fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(Path::new(&path), content).map_err(|e| format!("write failed: {e}"))
}

#[tauri::command]
pub fn render_markdown(source: String, dark: bool) -> String {
    markdown::render(&source, dark)
}

#[tauri::command]
pub fn watch_file(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let p = PathBuf::from(&path);
    state.watch(app, p)
}

#[tauri::command]
pub fn unwatch_file(state: State<'_, WatcherState>) {
    state.unwatch();
}

#[tauri::command]
pub fn current_watch(state: State<'_, WatcherState>) -> Option<String> {
    state.current().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("path does not exist: {path}"));
    }
    let read = std::fs::read_dir(p).map_err(|e| format!("read_dir failed: {e}"))?;
    let mut entries: Vec<DirEntry> = read
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            // Hide dotfiles & common noise — keeps the tree clean
            if name.starts_with('.') {
                return None;
            }
            let path_buf = e.path();
            let is_dir = path_buf.is_dir();
            let is_md = !is_dir
                && matches!(
                    path_buf
                        .extension()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_ascii_lowercase())
                        .as_deref(),
                    Some("md") | Some("markdown") | Some("mdown") | Some("mkd") | Some("mkdn")
                );
            Some(DirEntry {
                name,
                path: path_buf.to_string_lossy().to_string(),
                is_dir,
                is_md,
            })
        })
        .collect();
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

#[tauri::command]
pub fn parent_of(path: String) -> Option<String> {
    Path::new(&path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
}

/// Spawn a new top-level window for a torn-out tab.
///
/// **Strategy: separate OS process, not Tauri sub-window.**
/// Three previous attempts using `WebviewWindowBuilder` from inside a Tauri
/// command resulted in a white-screen child window AND a frozen parent window
/// — likely because Tauri 2 spawning an additional WebviewWindow from a
/// command thread interacts badly with WebView2's COM threading, blocking the
/// main event loop. Process-spawn sidesteps this entirely:
///
/// - Each torn-out window is a fresh `md-reader.exe` process, fully isolated.
/// - If the child crashes, the parent keeps running. No more frozen-app bug.
/// - WebView2 runtime is shared at the OS level, so the memory cost per
///   window is just the Tauri/Rust binary (~10 MB).
/// - `--new-window` flag tells the spawned instance to skip the
///   single-instance plugin (see lib.rs setup), so it actually runs as its
///   own process instead of forwarding the path to the existing instance.
#[tauri::command]
pub fn spawn_window(file: String) -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("spawn_window: cannot resolve current exe path: {e}"))?;

    let mut cmd = std::process::Command::new(&exe);
    cmd.arg("--new-window").arg(&file);

    // On Windows, ensure the new process gets its own console group so that
    // closing the parent doesn't take it down.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        cmd.creation_flags(CREATE_NEW_PROCESS_GROUP);
    }

    cmd.spawn()
        .map_err(|e| format!("spawn_window: failed to start child process: {e}"))?;

    Ok(())
}

/// Whether this process was launched via tear-out (i.e. has --new-window in argv).
/// The frontend uses this to skip restoring previously-open tabs in torn-out
/// windows — those should only show the file they were spawned with.
#[tauri::command]
pub fn is_torn_out_window() -> bool {
    std::env::args().any(|a| a == "--new-window")
}
