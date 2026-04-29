use std::cmp::Ordering;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};

use serde::Serialize;
use tauri::{AppHandle, State, WebviewUrl, WebviewWindowBuilder};

use crate::markdown;
use crate::watcher::WatcherState;

static WINDOW_COUNTER: AtomicU64 = AtomicU64::new(0);

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

/// Open a new app window pre-loaded with the given file (used for tear-out tabs).
///
/// Strategy: spawn the new window with the same default URL the main window
/// uses (so URL resolution can never differ from the working main window).
/// Then emit a per-window event carrying the file path. The frontend listens
/// for the event and opens the file once it has mounted. We retry the emit a
/// few times in case the listener is registered slightly after the window
/// becomes ready — `openOrFocus` dedupes on path so duplicate emits are safe.
#[tauri::command]
pub fn spawn_window(app: AppHandle, file: String) -> Result<(), String> {
    use tauri::Emitter;

    let n = WINDOW_COUNTER.fetch_add(1, AtomicOrdering::SeqCst);
    let label = format!("md-{}", n);

    let win = WebviewWindowBuilder::new(&app, &label, WebviewUrl::default())
        .title("md-reader")
        .inner_size(1100.0, 760.0)
        .min_inner_size(480.0, 320.0)
        .build()
        .map_err(|e| format!("spawn_window failed: {e}"))?;

    let _ = win.set_focus();

    let win_clone = win.clone();
    let file_clone = file.clone();
    std::thread::spawn(move || {
        for delay_ms in [200u64, 600, 1500, 3000] {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            let _ = win_clone.emit("md-reader://open-file", &file_clone);
        }
    });

    Ok(())
}
