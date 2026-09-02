mod auth;
mod commands;
mod handover;
pub mod markdown;
mod secrets;
mod supabase;
mod updates;
mod watcher;

use tauri::{Emitter, Manager};

use crate::commands::InitialFiles;
use crate::watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // If this process was launched as a tear-out window via spawn_window
    // (passes `--new-window <file>`), skip the single-instance plugin so the
    // tear-out actually runs as its own independent process. Without this,
    // single-instance would forward the file path to the existing instance and
    // exit the new process — defeating the whole point of tear-out.
    let cli_args: Vec<String> = std::env::args().collect();
    let is_torn_out = cli_args.iter().any(|a| a == "--new-window");

    #[cfg(desktop)]
    if !is_torn_out {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Forward any file path args from the second invocation to the running window.
            let files: Vec<String> = args
                .iter()
                .skip(1)
                .filter(|a| !a.starts_with('-'))
                .cloned()
                .collect();
            if !files.is_empty() {
                let _ = app.emit("open-file-from-cli", files);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    // Capture CLI file args at process start. Frontend pulls these synchronously
    // on mount via take_initial_files — replaces the previous setTimeout-based
    // emit which raced with tab restore.
    let initial_files: Vec<String> = cli_args
        .iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .cloned()
        .collect();

    let result = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(WatcherState::new())
        .manage(InitialFiles::new(initial_files))
        .setup(move |app| {
            // Tab tear-out z-order fix (child side): if this process was
            // launched as a torn-out window, force focus on the main webview
            // window as soon as the app is ready. Pairs with the parent's
            // AllowSetForegroundWindow call in spawn_window — together they
            // ensure the new window comes to the front instead of opening
            // behind the parent (the v0.2.0 known issue).
            if is_torn_out {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_file,
            commands::save_file,
            commands::user_display_name,
            commands::read_text_file_opt,
            commands::write_text_file_mkdir,
            commands::write_text_file_if_absent,
            commands::remove_file_if_present,
            commands::read_file_base64,
            commands::write_file_base64,
            commands::render_markdown,
            commands::watch_file,
            commands::unwatch_file,
            commands::current_watch,
            commands::list_dir,
            commands::parent_of,
            commands::spawn_window,
            commands::is_torn_out_window,
            commands::take_initial_files,
            commands::set_titlebar_theme,
            commands::app_version,
            secrets::get_secret,
            secrets::set_secret,
            updates::update_status,
            account_state,
            account_sign_in,
            account_sign_out,
            handover_push,
            updates::download_and_install,
        ])
        .build(tauri::generate_context!());

    match result {
        // `build` + `run(callback)` rather than plain `run`, because the
        // callback is the only place macOS delivers files opened from Finder.
        // See `on_run_event`.
        Ok(app) => app.run(on_run_event),
        Err(e) => eprintln!("error while running tauri application: {e}"),
    }
}

/// Runtime events we care about.
///
/// ## Opening a file from Finder on macOS
///
/// Every other platform hands the app its file as a command-line argument, and
/// `run()` above reads `std::env::args()` on that basis. macOS does not.
/// Double-clicking a document sends the app an `kAEOpenDocuments` Apple Event —
/// `argv` stays empty — and Tauri surfaces that as `RunEvent::Opened`.
///
/// Without this handler the app looked broken in an especially confusing way:
/// the window appeared (so the file association plainly *was* working) and then
/// sat empty, no matter how many times you tried, because nothing was ever
/// asked to open. Quitting and relaunching could not help — the path was not
/// missing, it was never being read.
///
/// It also explains the folder-permission prompt that only showed up later.
/// macOS asks for access to a protected location (OneDrive, Desktop,
/// Documents) at the moment an app first *reads* one. Since the app never read
/// the dropped path, the prompt had no reason to appear; it finally surfaced
/// when the in-app file browser listed the folder directly. So the missing
/// prompt was a symptom of this same bug, not a second one.
fn on_run_event(_app: &tauri::AppHandle, _event: tauri::RunEvent) {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    if let tauri::RunEvent::Opened { urls } = &_event {
        let paths: Vec<String> = urls
            .iter()
            // Finder sends `file://` URLs; anything else (a custom scheme, a
            // web link handed to us by another app) is not ours to open.
            .filter_map(|u| u.to_file_path().ok())
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        if paths.is_empty() {
            return;
        }
        let state = _app.state::<InitialFiles>();
        if !state.park_unless_ready(paths.clone()) {
            // The window is already up — this is the "app is running, user
            // double-clicks a second file" case. Same event the
            // single-instance plugin uses on Windows and Linux, so the
            // frontend needs no macOS-specific branch.
            let _ = _app.emit("open-file-from-cli", paths);
            if let Some(window) = _app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
    }
}


// ─── Account & handover commands ────────────────────────────────────────────
//
// The webview never receives a token — only whether someone is signed in and
// what to call them. See `supabase.rs` for why that boundary is load-bearing
// in an app that renders arbitrary markdown with raw HTML enabled.

#[tauri::command]
async fn account_state() -> auth::AccountState {
    auth::current_account().await
}

#[tauri::command]
async fn account_sign_in() -> Result<auth::AccountState, String> {
    auth::sign_in().await
}

#[tauri::command]
async fn account_sign_out(app: tauri::AppHandle) -> Result<(), String> {
    // Withdraw this device's tabs first: after the token is gone there is no
    // way to delete them, and they would sit on the phone as a device that
    // never updates again.
    let _ = handover::withdraw(app).await;
    auth::sign_out().await;
    Ok(())
}

#[tauri::command]
async fn handover_push(
    app: tauri::AppHandle,
    label: String,
    tabs: Vec<handover::OpenTab>,
) -> Result<handover::PushResult, String> {
    handover::push(app, label, tabs).await
}
