use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use notify::{EventKind, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

type Deb = Debouncer<RecommendedWatcher, RecommendedCache>;

/// Polling interval for the mtime-based fallback. Tradeoff between liveness
/// (lower = more responsive on OneDrive/etc.) and CPU/syscall load. 1.2s feels
/// instantaneous to a human reader and is essentially free on disk-cached stat.
const POLL_INTERVAL: Duration = Duration::from_millis(1200);

pub struct WatcherState {
    inner: Mutex<Option<Active>>,
}

struct Active {
    _debouncer: Deb,
    path: PathBuf,
    /// Signal flag for the poll fallback thread to exit on next wakeup.
    poll_stop: Arc<AtomicBool>,
}

impl Drop for Active {
    fn drop(&mut self) {
        self.poll_stop.store(true, Ordering::SeqCst);
    }
}

impl WatcherState {
    pub fn new() -> Self {
        Self { inner: Mutex::new(None) }
    }

    pub fn watch(&self, app: AppHandle, path: PathBuf) -> Result<(), String> {
        // Replace any existing watcher first; Drop on Active signals its
        // poll thread to exit and frees the notify debouncer.
        *self.inner.lock() = None;

        let emit_path = path.to_string_lossy().to_string();

        // ── Strategy 1: notify-based watcher on the parent directory. ──
        // Catches local-disk edits instantly, including atomic-save / rename
        // patterns from editors and Claude Code's Edit tool.
        let notify_app = app.clone();
        let notify_emit_path = emit_path.clone();
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
                        let _ = notify_app.emit("file-changed", &notify_emit_path);
                    }
                }
            },
        )
        .map_err(|e| e.to_string())?;

        let mut deb = debouncer;
        let watch_target = path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| path.clone());
        deb.watch(&watch_target, RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;

        // ── Strategy 2: poll-based mtime fallback. ──
        // notify on Windows uses ReadDirectoryChangesW, which is documented as
        // unreliable on virtual filesystems (OneDrive, Dropbox, Google Drive
        // Stream — all use reparse points / "Files On-Demand"). It can drop or
        // delay events by minutes. So we additionally poll the file's mtime
        // every POLL_INTERVAL. The frontend dedupes (only re-renders if content
        // actually differs), so duplicate events from notify+poll are harmless.
        let poll_stop = Arc::new(AtomicBool::new(false));
        {
            let stop = poll_stop.clone();
            let poll_path = path.clone();
            let poll_app = app.clone();
            let poll_emit_path = emit_path.clone();
            std::thread::spawn(move || {
                let mut last_mtime: Option<SystemTime> = std::fs::metadata(&poll_path)
                    .and_then(|m| m.modified())
                    .ok();
                let mut last_size: Option<u64> = std::fs::metadata(&poll_path)
                    .map(|m| m.len())
                    .ok();
                while !stop.load(Ordering::SeqCst) {
                    std::thread::sleep(POLL_INTERVAL);
                    if stop.load(Ordering::SeqCst) {
                        break;
                    }
                    let meta = match std::fs::metadata(&poll_path) {
                        Ok(m) => m,
                        Err(_) => continue, // file temporarily inaccessible (rename, sync, etc.)
                    };
                    let mtime = meta.modified().ok();
                    let size = meta.len();
                    let mtime_changed = mtime != last_mtime && mtime.is_some();
                    let size_changed = Some(size) != last_size;
                    if mtime_changed || size_changed {
                        last_mtime = mtime;
                        last_size = Some(size);
                        let _ = poll_app.emit("file-changed", &poll_emit_path);
                    }
                }
            });
        }

        *self.inner.lock() = Some(Active {
            _debouncer: deb,
            path,
            poll_stop,
        });
        Ok(())
    }

    pub fn unwatch(&self) {
        *self.inner.lock() = None;
    }

    pub fn current(&self) -> Option<PathBuf> {
        self.inner.lock().as_ref().map(|a| a.path.clone())
    }
}
