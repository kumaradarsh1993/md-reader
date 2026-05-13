use std::cmp::Ordering;
use std::path::{Path, PathBuf};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::markdown;
use crate::watcher::WatcherState;

/// CLI file paths captured at process start. The frontend pulls these
/// synchronously on mount via `take_initial_files`, eliminating the race we
/// previously had with the post-mount `setTimeout`-based emit (which fired
/// _after_ tab-restore had a chance to clobber activeId).
pub struct InitialFiles(pub Mutex<Vec<String>>);

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

    let child = cmd
        .spawn()
        .map_err(|e| format!("spawn_window: failed to start child process: {e}"))?;

    // Z-order fix: on Windows the default "foreground lock" policy buries
    // newly-spawned process windows behind whichever window currently has
    // focus (typically: the parent md-reader window the user just dragged
    // a tab out of). AllowSetForegroundWindow transfers the parent's
    // foreground privilege to the child PID so the child's window can
    // legitimately come to the front when WebView2 finishes initialising.
    // The child *also* explicitly calls set_focus() in lib.rs::setup — belt
    // and braces, because either step alone is unreliable.
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::AllowSetForegroundWindow;
        // Safety: passing a u32 PID we just got from spawn(). The Win32 call
        // is a simple privilege grant — no pointers, no allocations, no UB.
        unsafe {
            AllowSetForegroundWindow(child.id());
        }
    }

    // Explicitly drop the child handle so we don't accumulate zombie process
    // handles in the parent (each tear-out is a fire-and-forget — the child
    // is independent and we don't need to wait on it).
    drop(child);

    Ok(())
}

/// Whether this process was launched via tear-out (i.e. has --new-window in argv).
/// The frontend uses this to skip restoring previously-open tabs in torn-out
/// windows — those should only show the file they were spawned with.
#[tauri::command]
pub fn is_torn_out_window() -> bool {
    std::env::args().any(|a| a == "--new-window")
}

/// Drain and return the CLI-passed file paths captured at process start.
/// Called once by the frontend on mount; if non-empty, the frontend opens
/// those files and skips session-restore (the user's intent is "open these
/// specific files, not whatever was open last time"). Subsequent file-open
/// requests during the running session arrive via the single-instance
/// plugin's emit, not this command.
#[tauri::command]
pub fn take_initial_files(state: State<'_, InitialFiles>) -> Vec<String> {
    let mut guard = state.0.lock();
    let out = guard.clone();
    guard.clear();
    out
}
