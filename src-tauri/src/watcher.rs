use std::path::PathBuf;
use std::time::Duration;

use notify::{EventKind, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

type Deb = Debouncer<RecommendedWatcher, RecommendedCache>;

pub struct WatcherState {
    inner: Mutex<Option<Active>>,
}

struct Active {
    _debouncer: Deb,
    path: PathBuf,
}

impl WatcherState {
    pub fn new() -> Self {
        Self { inner: Mutex::new(None) }
    }

    pub fn watch(&self, app: AppHandle, path: PathBuf) -> Result<(), String> {
        // Replace any existing watcher first.
        *self.inner.lock() = None;

        let emit_path = path.to_string_lossy().to_string();
        let app_handle = app.clone();

        let debouncer = new_debouncer(
            Duration::from_millis(150),
            None,
            move |result: DebounceEventResult| {
                if let Ok(events) = result {
                    let interesting = events.iter().any(|e| {
                        matches!(
                            e.event.kind,
                            EventKind::Modify(_) | EventKind::Create(_)
                        )
                    });
                    if interesting {
                        let _ = app_handle.emit("file-changed", &emit_path);
                    }
                }
            },
        )
        .map_err(|e| e.to_string())?;

        let mut deb = debouncer;
        // Watch the parent directory non-recursively so atomic-save patterns
        // (rename-into-place by editors / Claude Code) still trigger events.
        let watch_target = path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| path.clone());
        deb.watch(&watch_target, RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;

        *self.inner.lock() = Some(Active { _debouncer: deb, path });
        Ok(())
    }

    pub fn unwatch(&self) {
        *self.inner.lock() = None;
    }

    pub fn current(&self) -> Option<PathBuf> {
        self.inner.lock().as_ref().map(|a| a.path.clone())
    }
}
