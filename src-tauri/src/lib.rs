mod commands;
pub mod markdown;
mod watcher;

use tauri::{Emitter, Manager};

use crate::watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
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

    let result = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(WatcherState::new())
        .setup(|app| {
            // First-launch CLI args: when Explorer opens a .md by file association,
            // the path is passed as argv[1]. Defer the emit so the frontend has mounted.
            let args: Vec<String> = std::env::args()
                .skip(1)
                .filter(|a| !a.starts_with('-'))
                .collect();
            if !args.is_empty() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(400));
                    let _ = handle.emit("open-file-from-cli", args);
                });
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
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("error while running tauri application: {e}");
    }
}
