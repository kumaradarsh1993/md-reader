use std::cmp::Ordering;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

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
    /// Last-modified time, ms since the Unix epoch. `None` when the platform
    /// or filesystem won't report one — the frontend falls back to sorting
    /// those entries last rather than pretending they are from 1970.
    pub modified: Option<u64>,
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

/// A human name to attribute a comment to.
///
/// Read from the environment rather than asked for: a reader app should not
/// open with a "what is your name?" prompt to let you highlight a sentence.
/// The user can override it in Settings; this is only the first guess.
#[tauri::command]
pub fn user_display_name() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default()
        .trim()
        .to_string()
}

/// Read a text file, or `None` if it is not there.
///
/// Distinct from `open_file` because "no notes yet" is the normal state for
/// most documents, not an error worth surfacing. A missing file returns `None`;
/// anything else — a permissions failure, a directory where a file was expected
/// — still returns `Err`, because those the user does want to hear about.
#[tauri::command]
pub fn read_text_file_opt(path: String) -> Result<Option<String>, String> {
    match std::fs::read_to_string(Path::new(&path)) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("read failed: {e}")),
    }
}

/// Write a text file, creating parent directories as needed.
///
/// The sidecar lives in a `.foxmd/` folder that will not exist the first time
/// anyone highlights anything, and a plain write fails on a missing parent with
/// an error that reads like a permissions problem.
#[tauri::command]
pub fn write_text_file_mkdir(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("mkdir failed: {e}"))?;
    }
    std::fs::write(p, content).map_err(|e| format!("write failed: {e}"))
}

/// Write only if nothing is there. Used for the `.foxmd/README.md`, which
/// explains the folder once and must never clobber a hand-edited version.
#[tauri::command]
pub fn write_text_file_if_absent(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Ok(());
    }
    write_text_file_mkdir(path, content)
}

/// Delete a file if it exists. Deliberately narrow: it refuses anything that is
/// not a regular file, so a bad path can never take a directory with it.
#[tauri::command]
pub fn remove_file_if_present(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Ok(());
    }
    std::fs::remove_file(p).map_err(|e| format!("delete failed: {e}"))
}

/// Largest image the .docx exporter will embed, in bytes.
///
/// Not a guess at what Word can hold — a guard on the transport. The bytes make
/// the trip to the webview as base64, so a 200MB TIFF someone linked from a
/// markdown file would be a ~270MB JavaScript string before anything else went
/// wrong. 24MB covers every screenshot and diagram a document actually carries.
const MAX_EMBED_BYTES: u64 = 24 * 1024 * 1024;

/// Read a file as base64 so the frontend can embed it in a document it is
/// building. Used only by the .docx exporter, for images.
///
/// Base64 rather than `Vec<u8>`: Tauri serialises a byte vector as a JSON array
/// of numbers, which costs roughly six characters per byte on the wire and then
/// allocates a JS array of that length. Base64 is 1.33x and decodes natively.
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| format!("stat failed: {e}"))?;
    if meta.len() > MAX_EMBED_BYTES {
        return Err(format!(
            "file is {:.1}MB, over the {}MB embed limit",
            meta.len() as f64 / (1024.0 * 1024.0),
            MAX_EMBED_BYTES / (1024 * 1024)
        ));
    }
    let bytes = std::fs::read(p).map_err(|e| format!("read failed: {e}"))?;
    Ok(b64_encode(&bytes))
}

/// Write raw bytes, decoded from base64. The .docx exporter's save path.
#[tauri::command]
pub fn write_file_base64(path: String, data: String) -> Result<(), String> {
    let bytes = b64_decode(&data)?;
    std::fs::write(Path::new(&path), bytes).map_err(|e| format!("write failed: {e}"))
}

const B64_ALPHABET: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Standard base64 with padding. Hand-rolled rather than adding a crate: it is
/// twenty lines, it has no configuration to get wrong, and this is the only
/// place in the app that needs it.
fn b64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(B64_ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(B64_ALPHABET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            B64_ALPHABET[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            B64_ALPHABET[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

fn b64_value(c: u8) -> Option<u32> {
    match c {
        b'A'..=b'Z' => Some((c - b'A') as u32),
        b'a'..=b'z' => Some((c - b'a') as u32 + 26),
        b'0'..=b'9' => Some((c - b'0') as u32 + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let mut acc: u32 = 0;
    let mut bits = 0u32;
    for c in s.bytes() {
        if c == b'=' || c.is_ascii_whitespace() {
            continue;
        }
        let v = b64_value(c).ok_or_else(|| format!("bad base64 byte {c:#x}"))?;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    Ok(out)
}

/// `theme` is the *resolved* palette name — "light", "dark" or "sepia" — not
/// the user's setting (which may be "auto"). The frontend already computes it
/// via `effectiveThemeName()`; passing a boolean here was what left sepia
/// sharing the light syntax palette.
#[tauri::command]
pub fn render_markdown(source: String, theme: String) -> String {
    markdown::render(&source, &theme)
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
            let modified = e
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64);
            Some(DirEntry {
                name,
                path: path_buf.to_string_lossy().to_string(),
                is_dir,
                is_md,
                modified,
            })
        })
        .collect();
    // Name order, folders first — the frontend re-sorts when the user asks
    // for something else, but an unsorted listing should never reach the UI.
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
/// Given `…/md-reader.app/Contents/MacOS/md-reader`, return `…/md-reader.app`.
///
/// Deliberately *not* `#[cfg(target_os = "macos")]`-gated, so it still gets
/// type-checked by `cargo check` on the Windows dev machine — the macOS build
/// only ever happens in CI, and untypechecked platform-specific code is how you
/// find out about a typo forty minutes later.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn macos_bundle_root(exe: &Path) -> Option<PathBuf> {
    let macos_dir = exe.parent()?; // …/Contents/MacOS
    let contents = macos_dir.parent()?; // …/Contents
    let app = contents.parent()?; // …/Foo.app
    if macos_dir.file_name()? == "MacOS"
        && contents.file_name()? == "Contents"
        && app.extension()? == "app"
    {
        Some(app.to_path_buf())
    } else {
        None
    }
}

#[tauri::command]
pub fn spawn_window(file: String) -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("spawn_window: cannot resolve current exe path: {e}"))?;

    // macOS: re-executing the inner Mach-O binary directly does start a second
    // process and does show a window, but LaunchServices never learns about it,
    // so it gets no Dock representation and doesn't reliably come to the front —
    // the same class of problem AllowSetForegroundWindow solves on Windows.
    // `open -n -a` launches a genuine second instance of the bundle instead.
    // Falls through to the direct-exec path if anything about that fails, so a
    // non-bundled dev build (`cargo run`) still works.
    #[cfg(target_os = "macos")]
    {
        if let Some(app) = macos_bundle_root(&exe) {
            let spawned = std::process::Command::new("/usr/bin/open")
                .arg("-n")
                .arg("-a")
                .arg(&app)
                .arg("--args")
                .arg("--new-window")
                .arg(&file)
                .spawn();
            match spawned {
                Ok(child) => {
                    drop(child);
                    return Ok(());
                }
                Err(e) => {
                    eprintln!("spawn_window: `open -n -a` failed ({e}); using direct exec");
                }
            }
        }
    }

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

/// Paint the native title bar to match the app's theme.
///
/// The system title bar is the one piece of the window md-reader doesn't draw
/// itself, and by default Windows renders it from the *OS* light/dark setting.
/// So a user in a dark Windows with the app in sepia got a black bar sitting on
/// top of a cream document — the app looked like two programs stacked.
///
/// `caption` / `text` are 0xRRGGBB, converted here to Win32's COLORREF, which
/// is byte-reversed (0x00BBGGRR). `dark` additionally drives the immersive
/// dark-mode attribute, which is what colours the min/max/close glyphs and the
/// hover highlights behind them — setting the caption colour alone leaves those
/// glyphs black on a dark bar.
///
/// Caption/text/border colours need Windows 11 (build 22000+); on Windows 10
/// `DwmSetWindowAttribute` returns a failure HRESULT for those attributes,
/// which is why every call's result is deliberately ignored. The immersive
/// dark-mode attribute still applies there, so Windows 10 degrades to a
/// correctly light-or-dark bar without the exact tint.
#[cfg(windows)]
#[tauri::command]
pub fn set_titlebar_theme(
    window: tauri::WebviewWindow,
    dark: bool,
    caption: u32,
    text: u32,
) -> Result<(), String> {
    use windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute;

    const DWMWA_USE_IMMERSIVE_DARK_MODE: u32 = 20;
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWA_CAPTION_COLOR: u32 = 35;
    const DWMWA_TEXT_COLOR: u32 = 36;

    /// 0xRRGGBB -> COLORREF (0x00BBGGRR).
    fn colorref(rgb: u32) -> u32 {
        ((rgb & 0x00_00_FF) << 16) | (rgb & 0x00_FF_00) | ((rgb & 0xFF_00_00) >> 16)
    }

    let hwnd = window.hwnd().map_err(|e| format!("no window handle: {e}"))?;
    let hwnd = hwnd.0 as _;

    let dark_flag: i32 = if dark { 1 } else { 0 };
    let caption_ref = colorref(caption);
    let text_ref = colorref(text);

    // SAFETY: `hwnd` is a live window handle owned by this process for the
    // duration of the call, and each pointer/length pair below describes a
    // stack local of exactly the size DWM documents for that attribute.
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE as _,
            &dark_flag as *const i32 as *const _,
            std::mem::size_of::<i32>() as u32,
        );
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_CAPTION_COLOR as _,
            &caption_ref as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        );
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_TEXT_COLOR as _,
            &text_ref as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        );
        // Border matches the caption so the window reads as one shape rather
        // than a tinted bar inside a default-coloured frame.
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR as _,
            &caption_ref as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        );
    }

    Ok(())
}

/// No-op elsewhere. macOS gets its unified appearance from the window's own
/// `theme` (set by Tauri from the app theme) and Linux title bars are drawn by
/// the desktop environment, which does not take instruction from applications.
/// The command still exists on every platform so the frontend can call it
/// unconditionally rather than branching on `isMac`.
#[cfg(not(windows))]
#[tauri::command]
pub fn set_titlebar_theme(
    _window: tauri::WebviewWindow,
    _dark: bool,
    _caption: u32,
    _text: u32,
) -> Result<(), String> {
    Ok(())
}
