mod commands;
pub mod markdown;
mod watcher;

use parking_lot::Mutex;
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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(WatcherState::new())
        .manage(InitialFiles(Mutex::new(initial_files)))
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
            commands::render_markdown,
            commands::watch_file,
            commands::unwatch_file,
            commands::current_watch,
            commands::list_dir,
            commands::parent_of,
            commands::spawn_window,
            commands::is_torn_out_window,
            commands::take_initial_files,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("error while running tauri application: {e}");
    }
}
