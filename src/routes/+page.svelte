<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import type { UnlistenFn } from "@tauri-apps/api/event";
  import { api } from "$lib/api";
  import {
    settings,
    effectiveThemeName,
    WIDTH_MIN,
    WIDTH_MAX,
    type ThemeMode,
  } from "$lib/settings-store.svelte";
  import { tabs } from "$lib/tabs-store.svelte";
  import Viewer from "$lib/Viewer.svelte";
  import WidthControl from "$lib/WidthControl.svelte";
  import Editor from "$lib/Editor.svelte";
  import WordPreview from "$lib/WordPreview.svelte";
  import SmartEditor from "$lib/SmartEditor.svelte";
  import LeftPanel from "$lib/LeftPanel.svelte";
  import TabBar from "$lib/TabBar.svelte";
  import Find from "$lib/Find.svelte";
  import Settings from "$lib/Settings.svelte";
  import About from "$lib/About.svelte";
  import Icon from "$lib/Icon.svelte";
  import Breadcrumb from "$lib/Breadcrumb.svelte";
  import ContextMenu from "$lib/ContextMenu.svelte";
  import { contextMenu, type MenuEntry } from "$lib/context-menu.svelte";
  import { focus } from "$lib/focus-mode.svelte";
  import { refresher } from "$lib/refresh.svelte";
  import { isMac, sk, MOD, copyText, revealInFileManager } from "$lib/platform";
  import StatusBar from "$lib/theatre/StatusBar.svelte";
  import ResumeChip from "$lib/theatre/ResumeChip.svelte";
  import TipBanner from "$lib/theatre/TipBanner.svelte";
  import DiffSidebar from "$lib/theatre/DiffSidebar.svelte";
  import SidebarConnectors from "$lib/theatre/SidebarConnectors.svelte";
  import { toggleSidebar, viewSnapshots } from "$lib/theatre/store.svelte";
  import { changedSections } from "$lib/theatre/diff-engine";

  // "edit" picks the user's preferred sub-mode (settings.editorMode);
  // "rawEdit" forces the CodeMirror raw markdown source view.
  type Mode = "view" | "edit" | "rawEdit";

  let mode = $state<Mode>("view");
  let findOpen = $state(false);
  let settingsOpen = $state(false);
  let aboutOpen = $state(false);
  let fileMenuOpen = $state(false);
  /** Page preview — the markdown laid out under Word's page geometry. Not a
   *  mode of the editor: it replaces the document pane and leaves `mode`
   *  untouched, so closing it puts you back exactly where you were. */
  let previewOpen = $state(false);
  let viewerEl: HTMLElement | null = $state(null);
  let unlistenChange: UnlistenFn | null = null;
  let unlistenCli: UnlistenFn | null = null;
  let unlistenDrop: UnlistenFn | null = null;
  let unlistenOpenFile: UnlistenFn | null = null;
  let unlistenFocus: UnlistenFn | null = null;
  // Has any external edit been observed for the active tab this session?
  // Used to gate the TipBanner — we don't want to nag people on app open.
  let externalEditObserved = $state(false);

  // Convenience derived state from active tab
  let active = $derived(tabs.active);
  let path = $derived(active?.path ?? null);
  let source = $derived(active?.source ?? "");
  let dirty = $derived(active?.dirty ?? false);
  let cwd = $derived(path ? path.replace(/[\\/][^\\/]*$/, "") : null);

  // Theatre stale (yellow) highlight ranges for the active tab — drawn from
  // the in-flight or selected turn (unless the user has hidden them).
  let theatreRanges = $derived.by((): Array<{ from: number; to: number }> => {
    if (!active) return [];
    if (active.highlightsHidden) return [];
    if (!settings.s.advancedLiveEditTheatre) return [];
    const snaps = viewSnapshots(active);
    if (!snaps) return [];
    if (snaps.before === snaps.after) return [];
    const sections = changedSections(snaps.before, snaps.after);
    const out: Array<{ from: number; to: number }> = [];
    for (const s of sections) {
      for (const r of s.changedLineRangesAfter) out.push(r);
    }
    return out;
  });

  // Theatre fresh (green) highlight ranges — line ranges touched in the last
  // ~1.5s of the current turn. Only meaningful while the turn is live; once
  // an edit settles, store.svelte's decay loop empties this set.
  let theatreFreshRanges = $derived.by((): Array<{ from: number; to: number }> => {
    if (!active) return [];
    if (active.highlightsHidden) return [];
    if (!settings.s.advancedLiveEditTheatre) return [];
    return active.freshRanges.map((r) => ({ from: r.from, to: r.to }));
  });

  let theatreEngaged = $derived(
    !!active && (active.theatrePhase === "engaging" || active.theatrePhase === "engaged" || active.theatrePhase === "done"),
  );

  // Sidebar section list — derived once here so the connector overlay paints
  // leader lines anchored to the same cards the DiffSidebar renders. The
  // sidebar computes its own copy too; both calls are deterministic & cheap.
  let sidebarSections = $derived.by(() => {
    if (!active) return [];
    if (!active.sidebarOpen) return [];
    if (!settings.s.advancedLiveEditTheatre) return [];
    const snaps = viewSnapshots(active);
    if (!snaps) return [];
    return changedSections(snaps.before, snaps.after);
  });

  // Theme application — resolves "auto" to the OS preference and lets sepia
  // pass through. The CSS variables block at the bottom of this file keys
  // off the data-theme attribute, so writing it here swaps the palette.
  $effect(() => {
    document.documentElement.dataset.theme = effectiveThemeName(settings.s.theme);
  });

  // Surface style rides on its own attribute rather than being folded into the
  // theme, because it is a genuinely independent axis: three themes × two
  // surface styles, from one extra line of state.
  $effect(() => {
    document.documentElement.dataset.surface = settings.s.surfaceStyle;
  });

  /**
   * Push the palette out to the native title bar.
   *
   * The one strip of the window the app doesn't draw was being coloured by the
   * OS, so a dark Windows with the app in sepia gave you a black bar above a
   * cream page — two programs stacked. Reading the resolved chrome colour back
   * out of the CSS means there is exactly one definition of it: change
   * `--titlebar-bg` in the palette above and the title bar follows.
   *
   * v0.8.0: reads `--titlebar-bg` rather than `--chrome-bg`. In the flat
   * surface style the two are the same colour, so nothing changes; in the
   * layered style the title bar is the outermost — and therefore darkest —
   * surface, and this is what carries that step onto the part of the window
   * Windows draws for us.
   */
  $effect(() => {
    const name = effectiveThemeName(settings.s.theme);
    // A dependency, not decoration: the caption colour changes with it.
    const surface = settings.s.surfaceStyle;
    // Read after the attribute writes above have been applied.
    queueMicrotask(() => {
      void surface;
      const css = getComputedStyle(document.documentElement);
      const caption = cssColorToRgbInt(css.getPropertyValue("--titlebar-bg"));
      const text = cssColorToRgbInt(css.getPropertyValue("--chrome-fg"));
      if (caption === null || text === null) return;
      // Windows: exact caption/text/border colours via DWM.
      invoke("set_titlebar_theme", { dark: name === "dark", caption, text })
        .catch(() => { /* dev mode / unsupported platform — the CSS is unaffected */ });
      // macOS: there is no per-colour title bar API, but the window's
      // light/dark appearance is settable, and that is what decides whether
      // the native bar is near-white or near-black. Sepia counts as light.
      import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(name === "dark" ? "dark" : "light"))
        .catch(() => { /* not running under Tauri */ });
    });
  });

  /**
   * "#f6f5f2" | "rgb(246, 245, 242)" -> 0xF6F5F2.
   *
   * getComputedStyle returns whatever form the author wrote for a custom
   * property (unlike a real colour property, which normalises to rgb()), so
   * both spellings have to be handled.
   */
  function cssColorToRgbInt(value: string): number | null {
    const v = value.trim();
    if (!v) return null;
    const hex = /^#([0-9a-f]{6})$/i.exec(v);
    if (hex) return parseInt(hex[1], 16);
    const short = /^#([0-9a-f]{3})$/i.exec(v);
    if (short) {
      const [r, g, b] = short[1].split("");
      return parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
    }
    const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
    if (rgb) {
      const [r, g, b] = rgb.slice(1, 4).map((n) => Math.round(Number(n)) & 0xff);
      return (r << 16) | (g << 8) | b;
    }
    return null;
  }

  /** Cycle/select theme from the toolbar 3-way control. */
  function setTheme(t: ThemeMode) {
    settings.set("theme", t);
  }

  // Re-arm watcher whenever the active tab changes
  $effect(() => {
    const p = path;
    (async () => {
      await api.unwatchFile();
      if (p) await api.watchFile(p);
    })();
  });

  // Reset the global "external edit observed this session" flag whenever
  // the active tab changes. The TipBanner reads the *active tab* and this
  // flag together — clearing on tab switch means the tip won't carry over
  // from one tab to another (it's per-file in spirit, but the flag itself
  // is global to the page for simplicity).
  $effect(() => {
    const _ = active?.id;
    externalEditObserved = false;
  });

  // Keep document title in sync with active tab
  $effect(() => {
    const name = path ? path.split(/[\\/]/).pop() : null;
    document.title = name ? `${name} — Fox MD` : "Fox MD";
  });

  async function openInTab(p: string) {
    try {
      await tabs.openOrFocus(p);
    } catch (e) {
      console.error(e);
      alert(`Failed to open file: ${e}`);
    }
  }

  async function pickAndOpen() {
    const p = await api.pickFile();
    if (p) await openInTab(p);
  }

  async function save() {
    if (!active) return;
    await api.saveFile(active.path, active.source);
    tabs.markActiveSaved();
  }

  async function closeActiveTab() {
    if (active) tabs.close(active.id);
  }

  async function openRecent(p: string) {
    fileMenuOpen = false;
    await openInTab(p);
  }

  /** Re-read the active file, discarding nothing the user typed (view mode
   *  only path — the context menu offering this is on the rendered view). */
  async function reloadFromDisk() {
    if (!active) return;
    try {
      const refreshed = await api.openFile(active.path);
      tabs.setActiveSourceFromDisk(refreshed.content);
    } catch (e) {
      console.error("[Fox MD] reload failed", e);
    }
  }

  /** Everything, from disk: this folder's listing and every open tab. */
  function refreshAll() {
    fileMenuOpen = false;
    void refresher.run("user");
  }

  /** What the refresh button says it just did. Silence would be worse than a
   *  number here — the commonest outcome of a refresh is "nothing had changed",
   *  and a button that looks identical in that case reads as broken. */
  let refreshTitle = $derived.by(() => {
    const keys = `${sk("Mod", "R")} or F5`;
    const r = refresher.last;
    if (!r) return `Refresh — re-read this folder and every open tab from disk (${keys})`;
    const parts: string[] = [];
    parts.push(r.changed === 0 ? "everything was up to date" : `${r.changed} tab${r.changed === 1 ? "" : "s"} updated`);
    if (r.skipped > 0) parts.push(`${r.skipped} skipped (unsaved edits)`);
    if (r.missing > 0) parts.push(`${r.missing} missing on disk`);
    return `Refresh from disk (${keys}) — last run: ${parts.join(", ")}`;
  });

  function setMode(m: Mode) { mode = m; }
  // Ctrl+E: cycle view → smart edit → view. Power-users can still get the raw
  // CodeMirror source via the toolbar sub-toggle, Settings → Default edit mode,
  // or "Split" (which always uses raw on the left).
  function toggleEdit() { mode = mode === "view" ? "edit" : "view"; }

  function bumpZoom(delta: number) {
    const z = Math.min(2.5, Math.max(0.5, +(settings.s.zoom + delta).toFixed(2)));
    settings.set("zoom", z);
  }

  function bumpWidth(delta: number) {
    if (settings.s.fullWidth) settings.set("fullWidth", false);
    const w = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, settings.s.contentWidthCh + delta));
    settings.set("contentWidthCh", w);
  }

  /** Collapse / restore the whole left pane, ChatGPT-style. Which sections are
   *  enabled is left untouched, so expanding gives back exactly what you had. */
  function togglePane() {
    const next = !settings.s.panelCollapsed;
    settings.set("panelCollapsed", next);
    // Expanding with nothing enabled inside would look broken. Fall back to
    // the outline, which is the more useful of the two for a reader.
    if (!next && !settings.s.showFiles && !settings.s.showToc) {
      settings.set("showToc", true);
    }
  }

  /** The 📁 / 📑 buttons toggle a section, and additionally undo a collapse —
   *  asking for a section while the pane is hidden plainly means "show me it". */
  function revealSection(key: "showFiles" | "showToc") {
    const other = key === "showFiles" ? "showToc" : "showFiles";
    if (settings.s.panelCollapsed) {
      settings.set("panelCollapsed", false);
      settings.set(key, true);
      return;
    }
    const next = !settings.s[key];
    settings.set(key, next);
    // Turning off the last visible section collapses the pane rather than
    // leaving a stub of chrome behind.
    if (!next && !settings.s[other]) settings.set("panelCollapsed", true);
  }

  function onEditorChange(s: string) {
    tabs.setActiveSource(s);
  }

  // ─── Focus mode ──────────────────────────────────────────────────────
  //
  // F11 is the Windows/Linux convention. It is *not* Mac's — there F11 is
  // "Show Desktop" and the system binding for fullscreen is ⌃⌘F — so Mac gets
  // that instead, and the tooltip says whichever one actually applies.
  const FOCUS_KEY = isMac ? "⌃⌘F" : "F11";

  /** Pointer within this many px of the top edge re-reveals the toolbar. */
  const FOCUS_PEEK_PX = 4;
  /** …and it stays down until the pointer drops below this, so the toolbar
   *  doesn't flicker away the moment you move toward the button you wanted. */
  const FOCUS_PEEK_RELEASE_PX = 52;

  function onPointerMove(e: PointerEvent) {
    if (!focus.active) return;
    if (focus.peeking) {
      if (e.clientY > FOCUS_PEEK_RELEASE_PX) focus.setPeek(false);
    } else if (e.clientY <= FOCUS_PEEK_PX) {
      focus.setPeek(true);
    }
  }

  // ─── Context menus ───────────────────────────────────────────────────

  /** Right-click on the breadcrumb / document location. */
  function docPathMenu(): MenuEntry[] {
    if (!path) return [];
    const p = path;
    const name = p.split(/[\\/]/).pop() ?? p;
    const dir = p.replace(/[\\/][^\\/]*$/, "");
    return [
      { label: "Copy file name", icon: "copy", action: () => copyText(name) },
      { label: "Copy full path", icon: "copy", action: () => copyText(p) },
      { label: "Copy folder path", icon: "folder", action: () => copyText(dir) },
      { separator: true },
      {
        label: isMac ? "Reveal in Finder" : "Show in folder",
        icon: "external-link",
        action: () => revealInFileManager(p),
      },
    ];
  }

  /**
   * The app-wide fallback menu, for right-clicks that land on chrome nobody
   * has claimed (the toolbar background, gaps between controls). Without it
   * those spots would fall through to the WebView's own page menu, which is
   * the exact thing this feature exists to remove.
   */
  function onShellContextMenu(e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    // Real text fields keep the native menu on purpose: it is the only place
    // the user can *paste*, and reimplementing paste would mean asking for
    // clipboard-read permission to solve a problem nobody has.
    if (t?.closest("input, textarea, [contenteditable='true']")) return;
    // Anything that built its own menu already stopped propagation.
    if (e.defaultPrevented) return;
    contextMenu.open(e, [
      {
        label: "Open file…",
        icon: "folder-open",
        shortcut: sk("Mod", "O"),
        action: pickAndOpen,
      },
      {
        label: "Refresh from disk",
        icon: "refresh",
        shortcut: sk("Mod", "R"),
        action: refreshAll,
      },
      { separator: true },
      {
        label: settings.s.panelCollapsed ? "Show side panel" : "Hide side panel",
        icon: "panel-left",
        shortcut: sk("Mod", "B"),
        action: togglePane,
      },
      {
        label: focus.active ? "Exit focus mode" : "Focus mode",
        icon: focus.active ? "shrink" : "expand",
        shortcut: FOCUS_KEY,
        action: () => focus.toggle(),
      },
      { separator: true },
      {
        label: "Settings…",
        icon: "settings",
        shortcut: sk("Mod", ","),
        action: () => (settingsOpen = true),
      },
    ]);
  }

  function onKey(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    // Refresh first in the chain, and with preventDefault on both spellings:
    // in a webview Ctrl+R is "reload the page", which here would throw away
    // the whole session's tab state to achieve less than this does.
    if ((mod && e.key.toLowerCase() === "r") || e.key === "F5") { e.preventDefault(); refreshAll(); }
    else if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); pickAndOpen(); }
    else if (mod && e.key.toLowerCase() === "t") { e.preventDefault(); pickAndOpen(); }
    else if (mod && e.key.toLowerCase() === "w") { e.preventDefault(); closeActiveTab(); }
    else if (mod && e.key === "Tab" && !e.shiftKey) { e.preventDefault(); tabs.next(); }
    else if (mod && e.key === "Tab" && e.shiftKey) { e.preventDefault(); tabs.prev(); }
    // Ctrl+B is the near-universal "toggle the sidebar" binding (VS Code,
    // ChatGPT, Obsidian). In v0.5.x it toggled the Files section specifically,
    // which was a less useful thing to give the most memorable shortcut to.
    else if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); togglePane(); }
    // Ctrl+L and Ctrl+D removed in v0.3.0. The features they toggled
    // (liveTrack, diffMode) are being repackaged as Live Edit Theatre in
    // v0.4.0 with a new shortcut surface. See docs/proposals/live-edit-theatre.md.
    else if (mod && e.shiftKey && e.key.toLowerCase() === "d") {
      // Toggle the Live Edit Theatre diff sidebar for the active tab.
      // Only meaningful when theatre is enabled AND there's something to show.
      if (active) {
        e.preventDefault();
        toggleSidebar(active);
      }
    }
    else if (mod && e.key === ",") { e.preventDefault(); settingsOpen = true; }
    else if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); toggleEdit(); }
    else if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
      e.preventDefault();
      if (active) previewOpen = !previewOpen;
    }
    else if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); findOpen = true; }
    else if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); bumpZoom(0.1); }
    else if (mod && e.key === "-") { e.preventDefault(); bumpZoom(-0.1); }
    else if (mod && e.key === "0") { e.preventDefault(); settings.set("zoom", 1.0); }
    else if (mod && e.key === "]") { e.preventDefault(); bumpWidth(8); }
    else if (mod && e.key === "[") { e.preventDefault(); bumpWidth(-8); }
    else if (mod && e.key === "\\") { e.preventDefault(); settings.set("fullWidth", !settings.s.fullWidth); }
    else if (mod && e.key.toLowerCase() === "s") {
      if (mode !== "view") {
        // SmartEditor has its own host-level Ctrl+S handler (so the shortcut
        // works while focus is inside the editor). When focus is elsewhere
        // (toolbar, etc.) we still want Ctrl+S to save.
        e.preventDefault();
        save();
      }
    }
    // Focus mode. F11 everywhere; ⌃⌘F additionally on Mac, where F11 belongs
    // to Mission Control and pressing it here would show the desktop instead.
    else if (e.key === "F11" || (isMac && e.ctrlKey && e.metaKey && e.key.toLowerCase() === "f")) {
      e.preventDefault();
      focus.toggle();
    }
    else if (e.key === "F12") {
      e.preventDefault();
      import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => {
        try { (getCurrentWebview() as any).openDevtools?.(); } catch { /* noop */ }
      });
    } else if (e.key === "Escape") {
      // Close one layer at a time, outermost first, so Escape never dismisses
      // more than the user was looking at. The context menu is handled in
      // ContextMenu.svelte's own capture-phase listener, so by the time we get
      // here it has already consumed the key.
      if (findOpen || settingsOpen || fileMenuOpen || aboutOpen) {
        findOpen = false;
        settingsOpen = false;
        fileMenuOpen = false;
        aboutOpen = false;
      } else if (active?.sidebarOpen) {
        active.sidebarOpen = false;
      } else if (focus.active) {
        // Last, because leaving focus mode is the biggest change of the lot —
        // Escape should never drop you out of it while a dialog was what you
        // meant to close.
        focus.exit();
      }
    }
  }

  onMount(async () => {
    // ── Local wiring first, and unconditionally ──────────────────────────
    //
    // Ordering here is load-bearing, not stylistic. All of this used to sit
    // *after* a run of awaited Tauri calls, so a single rejection anywhere in
    // that chain aborted the rest of onMount and silently took the entire
    // keyboard with it — every shortcut in the app, gone, with no error the
    // user could see. Nothing below depends on the backend, so nothing below
    // should be able to be cancelled by it.
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onPointerMove);

    // Kill the WebView's own page menu app-wide, once, in the capture phase.
    // Components that want a real menu call contextMenu.open(), which itself
    // calls preventDefault — so this listener's only job is making sure the
    // browser menu never appears in the gaps nobody thought about.
    // Text fields are exempt: their native menu is where "Paste" lives.
    suppressNativeMenu = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
    };
    window.addEventListener("contextmenu", suppressNativeMenu, { capture: true });

    // Belt-and-suspenders: HTML5-level dragover preventDefault so the OS-level
    // Tauri drop handler always wins over any in-page drag-drop machinery.
    dragSwallowers = (e: DragEvent) => {
      const items = e.dataTransfer?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind === "file") { e.preventDefault(); return; }
      }
    };
    window.addEventListener("dragover", dragSwallowers);
    window.addEventListener("drop", dragSwallowers);

    // Coming back to the window is the moment the app is most likely to be
    // showing something stale — you were away in a terminal or an editor, and
    // that is where the changes came from. So sweep then, silently. Tabs with
    // unsaved edits are skipped inside `reloadAllFromDisk`, and windows are
    // separate processes, so each one keeps itself honest independently.
    refreshOnFocus = () => { void refresher.run("focus"); };
    window.addEventListener("focus", refreshOnFocus);

    // Reading positions are written on a short debounce; make sure the window
    // closing (or being hidden) never beats that timer to the punch.
    flushOnExit = () => { void settings.flushPendingWrites(); };
    window.addEventListener("beforeunload", flushOnExit);
    window.addEventListener("pagehide", flushOnExit);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushOnExit?.();
    });

    // ── Backend wiring ───────────────────────────────────────────────────
    await settings.init();

    // The native focus signal, in addition to the DOM one wired above:
    // WebView2 does not reliably deliver a window-level `focus` event when the
    // OS window is activated. The refresher coalesces, so two signals for one
    // activation cost nothing.
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      unlistenFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) void refresher.run("focus");
      });
    } catch { /* not running under Tauri */ }

    unlistenCli = await api.onOpenFromCli((paths) => {
      if (paths[0]) openInTab(paths[0]);
    });

    // Vestigial from the in-process spawn era — keep the listener around so we
    // can still react to per-window file-open events if anything ever emits
    // them again. Process-based tear-out uses the regular onOpenFromCli path.
    unlistenOpenFile = await api.onOpenFileEvent((p) => {
      if (p) openInTab(p);
    });

    unlistenChange = await api.onFileChanged(async (changedPath) => {
      if (active && changedPath === active.path) {
        try {
          const refreshed = await api.openFile(active.path);
          if (refreshed.content !== active.source) {
            tabs.setActiveSourceFromDisk(refreshed.content);
            // Mark that we've seen an external edit — the TipBanner uses
            // this to decide whether to surface the Live Edit Theatre tip
            // (only for users who haven't enabled the feature yet).
            externalEditObserved = true;
          }
        } catch { /* atomic-save transient */ }
      }
    });

    // Native OS file-drop on the window — opens each .md as a new tab.
    // We log a hint on every drop event so it's easy to debug from DevTools
    // console if a drop ever appears not to trigger.
    unlistenDrop = await getCurrentWebview().onDragDropEvent((evt) => {
      if (evt.payload.type === "drop") {
        console.log("[Fox MD] drop:", evt.payload.paths);
        const dropped = evt.payload.paths ?? [];
        let opened = 0;
        for (const p of dropped) {
          if (/\.(md|markdown|mdown|mkd|mkdn|txt)$/i.test(p)) {
            openInTab(p);
            opened++;
          }
        }
        if (dropped.length > 0 && opened === 0) {
          console.warn("[Fox MD] drop ignored — no markdown extension:", dropped);
        }
      }
    });

    // Initial-state determination, in priority order:
    // 1. Explorer file-association launch → take_initial_files returns the
    //    path; we open it and SKIP session restore (intent is "open this
    //    specific file, not whatever I had open last time").
    // 2. Torn-out window (--new-window) → take_initial_files returns the file
    //    we were spawned with; same handling as #1.
    // 3. Plain launch with no CLI args → restore previously-open tabs.
    // (Subsequent file-opens during a running session come through the
    // single-instance plugin's emit → onOpenFromCli listener above, not here.)
    let initialFiles: string[] = [];
    try { initialFiles = await api.takeInitialFiles(); } catch { /* dev mode */ }

    if (initialFiles.length > 0) {
      for (const p of initialFiles) {
        await openInTab(p);
      }
    } else {
      let isTornOut = false;
      try { isTornOut = await api.isTornOutWindow(); } catch { /* dev mode */ }
      if (!isTornOut && tabs.tabs.length === 0) {
        await tabs.restore();
      }
    }
  });

  let dragSwallowers: ((e: DragEvent) => void) | null = null;
  let flushOnExit: (() => void) | null = null;
  let suppressNativeMenu: ((e: MouseEvent) => void) | null = null;
  let refreshOnFocus: (() => void) | null = null;

  onDestroy(() => {
    unlistenCli?.();
    unlistenChange?.();
    unlistenDrop?.();
    unlistenOpenFile?.();
    unlistenFocus?.();
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("pointermove", onPointerMove);
    if (refreshOnFocus) window.removeEventListener("focus", refreshOnFocus);
    if (suppressNativeMenu) {
      window.removeEventListener("contextmenu", suppressNativeMenu, { capture: true });
    }
    if (flushOnExit) {
      window.removeEventListener("beforeunload", flushOnExit);
      window.removeEventListener("pagehide", flushOnExit);
      flushOnExit();
    }
    if (dragSwallowers) {
      window.removeEventListener("dragover", dragSwallowers);
      window.removeEventListener("drop", dragSwallowers);
    }
  });
</script>

<svelte:head>
  <title>Fox MD</title>
</svelte:head>

<!-- The shell owns the fallback right-click menu: a context menu is only
     convincing if there is no seam in it, and the seams are exactly the
     places (toolbar background, empty chrome) that no component claims.
     svelte-ignore is right here — this is a passive catch-all on a layout
     div, not an interactive control. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="shell" class:focus-mode={focus.active} oncontextmenu={onShellContextMenu}>
  <header
    class="toolbar"
    class:mac={isMac}
    class:focus-hidden={focus.active}
    class:focus-peek={focus.active && focus.peeking}
  >
    <div class="left">
      <!-- Leftmost, ahead of the File menu: this button governs the whole
           window's layout, and layout controls belong at the outside edge —
           the same place VS Code, ChatGPT and Obsidian put it. -->
      <button
        class="icon-btn pane-btn"
        class:pane-open={!settings.s.panelCollapsed}
        onclick={togglePane}
        title={settings.s.panelCollapsed
          ? `Show side panel (${sk("Mod", "B")}) — or hover the left edge for a peek`
          : `Hide side panel (${sk("Mod", "B")})`}
        aria-label="Toggle side panel"
        aria-expanded={!settings.s.panelCollapsed}
      >
        <Icon name="panel-left" size={17} />
      </button>
      <div class="tool-divider" aria-hidden="true"></div>
      <button class="file-btn" onclick={() => (fileMenuOpen = !fileMenuOpen)} title="File menu" aria-haspopup="menu" aria-expanded={fileMenuOpen}>
        File <Icon name="chevron-down" size={11} class="caret" />
      </button>
      <!-- Next to File because that is where "what is on screen right now"
           lives. It re-reads the folder listing and every open tab, which is
           the whole set of things the single-file watcher cannot see. -->
      <button
        class="icon-btn refresh-btn"
        class:spinning={refresher.busy}
        onclick={refreshAll}
        title={refreshTitle}
        aria-label="Refresh from disk"
      >
        <Icon name="refresh" size={15} />
      </button>
      <div class="seg">
        <button class:active={mode === "view"} onclick={() => setMode("view")}>View</button>
        <button class:active={mode === "edit" || mode === "rawEdit"} onclick={() => setMode("edit")}>Edit</button>
      </div>
      {#if mode === "edit" || mode === "rawEdit"}
        <div class="seg edit-sub" title="Edit mode: Smart hides markdown syntax · Raw shows the source">
          <button
            class:active={mode === "edit" && settings.s.editorMode === "smart"}
            onclick={() => { settings.set("editorMode", "smart"); setMode("edit"); }}
          >Smart</button>
          <button
            class:active={mode === "rawEdit" || (mode === "edit" && settings.s.editorMode === "raw")}
            onclick={() => { settings.set("editorMode", "raw"); setMode("rawEdit"); }}
          >Raw</button>
        </div>
      {/if}
      <!-- …and these two choose what goes *inside* the pane. Keeping them
           adjacent to, but visually distinct from, the pane button is what
           makes the whole/parts relationship readable. -->
      <div class="seg panel-toggles" title="Choose what the side panel shows">
        <button
          class:active={settings.s.showFiles && !settings.s.panelCollapsed}
          onclick={() => revealSection("showFiles")}
          title="Files"
          aria-label="Toggle files panel"
        ><Icon name="folder" size={14} /></button>
        <button
          class:active={settings.s.showToc && !settings.s.panelCollapsed}
          onclick={() => revealSection("showToc")}
          title="Outline"
          aria-label="Toggle outline panel"
        ><Icon name="list-tree" size={14} /></button>
      </div>
      <!-- Track / Diff buttons removed in v0.3.0 — repackaged as the Live
           Edit Theatre experience in v0.4.0 (off by default, opt-in via
           Settings → Advanced features). -->
    </div>
    <div class="middle">
      {#if path}
        <Breadcrumb {path} {dirty} onContextMenu={(e) => contextMenu.open(e, docPathMenu())} />
      {:else}
        <span class="muted">No file open — {sk("Mod", "T")} to open, or drop a .md file here.</span>
      {/if}
    </div>
    <div class="right">
      <!-- Content width — a miniature page whose text column mirrors the real
           one. See WidthControl.svelte for why the old "86ch" badge went. -->
      <WidthControl />
      <div class="tool-divider" aria-hidden="true"></div>
      <!-- Zoom group: same segmented look as width, so they read as
           "two of the same kind of control, different axes". -->
      <div class="seg zoom-group" title={`Zoom — ${sk("Mod", "+")} / ${sk("Mod", "-")} / ${sk("Mod", "0")}`}>
        <button onclick={() => bumpZoom(-0.1)} aria-label="Zoom out" title={`Zoom out (${sk("Mod", "-")})`}><Icon name="minus" size={13} /></button>
        <span class="zoom">{Math.round(settings.s.zoom * 100)}%</span>
        <button onclick={() => bumpZoom(0.1)} aria-label="Zoom in" title={`Zoom in (${sk("Mod", "+")})`}><Icon name="plus" size={13} /></button>
      </div>
      <div class="tool-divider" aria-hidden="true"></div>
      <div class="seg theme-group" title="Theme — Light / Sepia / Dark">
        <button
          class:active={settings.s.theme === "light"}
          onclick={() => setTheme("light")}
          aria-label="Light theme"
          title="Light"
        ><Icon name="sun" size={14} /></button>
        <button
          class:active={settings.s.theme === "sepia"}
          onclick={() => setTheme("sepia")}
          aria-label="Sepia reading theme"
          title="Sepia (easy on the eyes)"
        ><Icon name="contrast" size={14} /></button>
        <button
          class:active={settings.s.theme === "dark"}
          onclick={() => setTheme("dark")}
          aria-label="Dark theme"
          title="Dark"
        ><Icon name="moon" size={14} /></button>
      </div>
      <div class="tool-divider" aria-hidden="true"></div>
      <button
        class="icon-btn lg"
        class:on={previewOpen}
        disabled={!active}
        onclick={() => (previewOpen = !previewOpen)}
        title={`Page preview — how this reads as a document: US Letter, 1in margins, Calibri Light 11pt, line numbers (${sk("Mod", "Shift", "P")})`}
        aria-label="Page preview"
        aria-pressed={previewOpen}
      ><Icon name="file-page" size={18} /></button>
      <button
        class="icon-btn lg"
        onclick={() => focus.toggle()}
        title={`Focus mode — just the document (${FOCUS_KEY})`}
        aria-label="Focus mode"
        aria-pressed={focus.active}
      ><Icon name={focus.active ? "shrink" : "expand"} size={18} /></button>
      <button class="icon-btn lg" onclick={() => (findOpen = true)} title={`Find (${sk("Mod", "F")})`} aria-label="Find"><Icon name="search" size={18} /></button>
      <button class="icon-btn lg" onclick={() => (settingsOpen = true)} title={`Settings (${sk("Mod", ",")})`} aria-label="Settings"><Icon name="settings" size={18} /></button>
    </div>
  </header>

  <div class="body" class:theatre-engaged={theatreEngaged} class:focus-body={focus.active}>
    {#if !focus.active}
      <LeftPanel
        {source}
        {cwd}
        activePath={path}
        onOpenFile={(p) => openInTab(p)}
      />
    {/if}
    <!-- The tab strip belongs to the document column, not to the window. Up
         to v0.6 it spanned the full width above the side panel too, which cut
         the panel off at the knees and left the tabs floating above a surface
         that isn't the one they switch between. Nesting it here makes the
         side panel full-height (the shape every modern app has settled on)
         and puts each tab directly above the paper it opens. -->
    <div class="doc-col">
      {#if !focus.active}
        <TabBar onNewTab={pickAndOpen} />
      {/if}
    <main
      class="content"
      class:theatre-content={theatreEngaged}
      bind:this={viewerEl}
    >
      {#if !active}
        <div class="empty-state">
          <div class="empty-glyph">⌘</div>
          <h2>No file open</h2>
          <p>Press <kbd>{MOD}</kbd>+<kbd>T</kbd> to open one, or drop a <code>.md</code> file onto the window.</p>
          {#if settings.s.recentFiles.length > 0}
            <div class="empty-recent">
              <div class="empty-label">Recent</div>
              {#each settings.s.recentFiles.slice(0, 5) as r}
                <button class="empty-recent-item" onclick={() => openInTab(r)} title={r}>
                  <span>{r.split(/[\\/]/).pop()}</span>
                  <span class="dim">{r.replace(/[\\/][^\\/]*$/, "").split(/[\\/]/).slice(-2).join("/")}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else if previewOpen}
        <WordPreview
          source={active.source}
          basePath={active.path}
          onExit={() => (previewOpen = false)}
        />
      {:else if mode === "edit" && settings.s.editorMode === "smart"}
        <SmartEditor source={active.source} onChange={onEditorChange} onSave={save} />
      {:else if mode === "edit" || mode === "rawEdit"}
        <Editor source={active.source} onChange={onEditorChange} onSave={save} />
      {:else}
        <Viewer
          source={active.source}
          basePath={active.path}
          mode={"view"}
          lastChangeFromDisk={active.diskTick}
          baselineSource={active.baselineSource}
          theatreHighlightRanges={theatreRanges}
          theatreFreshRanges={theatreFreshRanges}
          tabId={active.id}
          getScrollMark={(id) => tabs.tabs.find((t) => t.id === id)?.scrollMark ?? null}
          resumeMark={active.resumeMark}
          resumeDismissed={active.resumeDismissed}
          resumeApplied={active.resumeApplied}
          onScrollMark={(id, mark) => tabs.setScrollMark(id, mark)}
          onResumeApplied={(id) => tabs.markResumeApplied(id)}
          onDismissResume={(id) => tabs.dismissResume(id)}
          onOpenRelative={(p) => openInTab(p)}
          onFindSelection={() => (findOpen = true)}
          onReloadRequest={reloadFromDisk}
        />
      {/if}
      <Find bind:open={findOpen} target={viewerEl} />
    </main>
    </div>
    {#if active && active.sidebarOpen && settings.s.advancedLiveEditTheatre}
      <DiffSidebar tab={active} />
      <SidebarConnectors
        sections={sidebarSections}
        viewKey={String(active.selectedView)}
      />
    {/if}
  </div>
</div>

<!-- Theatre overlays — sit on top of everything else. Each is internally
     gated on the active tab's state so they no-op when nothing's happening. -->
{#if active && settings.s.advancedLiveEditTheatre}
  <StatusBar tab={active} />
  <ResumeChip tab={active} />
{/if}
{#if active}
  <TipBanner tab={active} {externalEditObserved} />
{/if}

<!-- One-shot reassurance on entering focus mode. A distraction-free mode that
     doesn't tell you how to leave is just a stuck window — this is the whole
     reason people distrust them. -->
{#if focus.showHint}
  <div class="focus-hint" role="status">
    <span>Focus mode</span>
    <span class="focus-hint-sep">·</span>
    <span class="focus-hint-dim">press <kbd>Esc</kbd> or <kbd>{FOCUS_KEY}</kbd> to exit</span>
  </div>
{/if}

<ContextMenu />

<Settings bind:open={settingsOpen} />

<!-- File menu rendered at root level so it escapes the toolbar's
     backdrop-filter stacking context (which was making it invisible) -->
{#if fileMenuOpen}
  <div class="menu-backdrop" onclick={() => (fileMenuOpen = false)} role="presentation"></div>
  <div class="menu file-menu" role="menu">
    <button class="menu-item" onclick={() => { fileMenuOpen = false; pickAndOpen(); }}>
      <span>Open file…</span><span class="kbd">{sk("Mod", "O")}</span>
    </button>
    <button class="menu-item" onclick={() => { fileMenuOpen = false; pickAndOpen(); }}>
      <span>New tab</span><span class="kbd">{sk("Mod", "T")}</span>
    </button>
    <button class="menu-item" onclick={refreshAll}>
      <span>Refresh from disk</span><span class="kbd">{sk("Mod", "R")}</span>
    </button>
    {#if settings.s.recentFiles.length > 0}
      <div class="menu-sep"></div>
      <div class="menu-label">Recent</div>
      {#each settings.s.recentFiles.slice(0, 8) as r}
        <button class="menu-item recent" onclick={() => openRecent(r)} title={r}>
          <span class="recent-name">{r.split(/[\\/]/).pop()}</span>
          <span class="recent-dir">{r.replace(/[\\/][^\\/]*$/, "").split(/[\\/]/).slice(-2).join("/")}</span>
        </button>
      {/each}
    {/if}
    <div class="menu-sep"></div>
    <button class="menu-item" disabled={!path} onclick={() => { fileMenuOpen = false; tabs.resetActiveBaseline(); }}>
      <span>Reset diff baseline</span><span class="kbd">diff = now</span>
    </button>
    <div class="menu-sep"></div>
    <button class="menu-item" disabled={!path} onclick={() => { fileMenuOpen = false; closeActiveTab(); }}>
      <span>Close tab</span><span class="kbd">{sk("Mod", "W")}</span>
    </button>
    <button class="menu-item" onclick={() => { fileMenuOpen = false; settingsOpen = true; }}>
      <span>Settings…</span><span class="kbd">{sk("Mod", ",")}</span>
    </button>
    <button class="menu-item" onclick={() => { fileMenuOpen = false; aboutOpen = true; }}>
      <span>About Fox MD…</span>
    </button>
  </div>
{/if}

<About bind:open={aboutOpen} />

<style>
  /* ═══ Palette ═══════════════════════════════════════════════════════
     Two surfaces, and the distinction between them is the whole design.

     `--bg` is PAPER: the document sheet, and nothing else. `--chrome-bg` is
     the application shell — toolbar, tab strip, side panel — which sits
     *behind* the paper and is deliberately a different material.

     Up to v0.6 these were within a couple of percent of each other in light
     mode and byte-identical in dark (`--side-bg: #1c1c1e` == `--bg`), which
     is exactly why the side panel "looked like the text you're reading":
     there was no surface boundary to see, only a hairline. The fix is not a
     louder border — it is giving the chrome its own material and floating the
     paper on top of it with a rounded edge and a real shadow. In dark mode
     the paper is *lighter* than the chrome, which is the convention every
     modern dark UI converged on (a dark sheet on a darker desk).

     `--paper-*` are the elevation tokens for that sheet. */
  :global(:root) {
    --bg: #ffffff;
    --bg-elevated: #ffffff;
    /* Subtle warm-paper tint for the smart-edit surface — distinguishes
       "I'm editing" from "I'm reading" without screaming. */
    --bg-edit: #fbfaf6;
    --fg: #1b1a18;
    --fg-strong: #0b0a09;
    --muted: #75736d;
    --muted-strong: #55534d;
    /* Document-side subtle fill (table headers, <kbd>). Distinct from the
       chrome tokens on purpose — v0.6 used one `--muted-bg` for both, which is
       how the tab strip ended up brighter than the page it sat above. */
    --muted-bg: #f1f0ed;
    --border: #e5e3de;
    --border-strong: #d5d2cb;
    --accent: #007aff;
    --accent-soft: rgba(0, 122, 255, 0.12);
    /* Fill for the "you are here" row in the outline. A touch stronger than
       --accent-soft, and defined per-theme rather than derived with
       color-mix() so it renders on older WebKitGTK too. */
    --accent-active: rgba(0, 122, 255, 0.15);
    --link: #0066cc;
    --code-bg: #f7f6f3;
    --code-inline-bg: rgba(120, 118, 110, 0.16);
    --blockquote-bg: rgba(60, 56, 45, 0.035);
    /* The shell. Everything that is not the document.
       Warm, and only ~3.5% off paper — the field (VS Code 2.7%, Notion 3.8%,
       shadcn 2%) separates chrome with an *edge*, not with tone. A bigger
       tonal step reads as "IDE", and a cool-grey step reads as "developer
       tool"; blue sits a few points below red in every token here. */
    --chrome-bg: #f6f5f2;
    --chrome-fg: #4a4841;
    --chrome-border: #e7e5e0;
    --chrome-hover: rgba(60, 56, 45, 0.06);
    --chrome-raised: #ffffff;
    /* Recessed track for segmented controls, a shade *below* the chrome. */
    --chrome-sunken: #eceae5;
    /* The four chrome surfaces, outermost first. In "flat" they are all one
       colour — the v0.7 design, where separation comes from edges. The
       "layered" surface style (below) gives each its own step. */
    --titlebar-bg: #f6f5f2;
    --toolbar-bg: var(--chrome-bg);
    --side-bg: var(--chrome-bg);
    --toolbar-border: transparent;
    --hover-bg: rgba(60, 56, 45, 0.05);
    --input-bg: #ffffff;
    --zebra-bg: #faf9f7;
    --highlight-bg: rgba(255, 214, 0, 0.45);
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
    --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.08);
    /* Elevation for the paper sheet against the chrome behind it. */
    --paper-radius: 10px;
    --paper-shadow: 0 0 0 1px rgba(0, 0, 0, 0.055), 0 1px 3px rgba(0, 0, 0, 0.05);
    --radius-sm: 5px;
    --radius-md: 8px;
    --radius-lg: 12px;
  }
  :global(html[data-theme="dark"]) {
    /* Paper is deliberately LIGHTER than the chrome here — content sits at
       the extreme of the range and chrome recedes toward mid-grey, which is
       the same rule as light mode read in the other direction. v0.6 had
       `--side-bg: #1c1c1e` and `--bg: #1c1c1e` — the same colour — so in dark
       mode the side panel and the document were literally one surface. */
    --bg: #1e1e1d;
    --bg-elevated: #2a2a28;
    /* Slightly lighter than --bg, reads as a "card" surface in dark mode. */
    --bg-edit: #232322;
    --fg: #f2f1ee;
    --fg-strong: #ffffff;
    --muted: #96948d;
    --muted-strong: #c4c2bb;
    --muted-bg: #2a2a28;
    --border: #343432;
    --border-strong: #464643;
    --accent: #0a84ff;
    --accent-soft: rgba(10, 132, 255, 0.18);
    --accent-active: rgba(10, 132, 255, 0.26);
    --link: #64b5f6;
    --code-bg: #262625;
    --code-inline-bg: rgba(150, 148, 141, 0.22);
    --blockquote-bg: rgba(255, 255, 255, 0.04);
    --chrome-bg: #171716;
    --chrome-fg: #a8a69f;
    --chrome-border: #2a2a28;
    --chrome-hover: rgba(255, 255, 255, 0.06);
    --chrome-raised: #2e2e2c;
    --chrome-sunken: #101010;
    --titlebar-bg: #171716;
    --toolbar-bg: var(--chrome-bg);
    --side-bg: var(--chrome-bg);
    --toolbar-border: transparent;
    --hover-bg: rgba(255, 255, 255, 0.06);
    --input-bg: #2a2a28;
    --zebra-bg: #232322;
    --highlight-bg: rgba(255, 204, 0, 0.32);
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.45);
    /* No outer glow in dark mode — a light halo around a dark sheet reads as
       a rendering artefact. The sheet separates by being lighter instead. */
    --paper-shadow: 0 0 0 1px rgba(255, 255, 255, 0.05);
  }
  /* Sepia — warm cream-paper palette for low-strain long reading.
     Contrast tuned to ~6:1 (text vs bg), comfortably above WCAG AA. The
     accent / link colours stay in the warm-umber family so the page reads
     as a single coherent surface rather than a light page with random
     blue links. v0.5.1+. */
  :global(html[data-theme="sepia"]) {
    /* Paper lifted a shade so the cream sheet still reads as *paper* against
       the warmer desk behind it. */
    --bg: #f7f0dd;
    --bg-elevated: #f8f1de;
    --bg-edit: #efe6cf;
    --fg: #4a3f33;
    --fg-strong: #2e2418;
    --muted: #8c7a62;
    --muted-strong: #5e4f3d;
    --muted-bg: #e6dcc2;
    --border: #ddd2b6;
    --border-strong: #c5b994;
    --accent: #b97f47;
    --accent-soft: rgba(185, 127, 71, 0.16);
    --accent-active: rgba(185, 127, 71, 0.22);
    --link: #875d2f;
    --code-bg: #ede3c8;
    --code-inline-bg: rgba(74, 63, 51, 0.13);
    --blockquote-bg: rgba(74, 63, 51, 0.04);
    --chrome-bg: #ebe1c7;
    --chrome-fg: #5a4b39;
    --chrome-border: #d9cdb0;
    --chrome-hover: rgba(74, 63, 51, 0.07);
    --chrome-raised: #f7f0dd;
    --chrome-sunken: #e2d7b9;
    --titlebar-bg: #ebe1c7;
    --toolbar-bg: var(--chrome-bg);
    --side-bg: var(--chrome-bg);
    --toolbar-border: transparent;
    --hover-bg: rgba(74, 63, 51, 0.06);
    --input-bg: #faf3df;
    --zebra-bg: #eee5cd;
    --highlight-bg: rgba(255, 173, 51, 0.35);
    --shadow-sm: 0 1px 2px rgba(74, 63, 51, 0.06);
    --shadow-md: 0 8px 24px rgba(74, 63, 51, 0.12);
    --paper-shadow: 0 0 0 1px rgba(74, 63, 51, 0.09), 0 1px 3px rgba(74, 63, 51, 0.07);
  }

  /* ═══ Surface style: "layered" ══════════════════════════════════════
     Settings → Appearance → Window surfaces. Flat (the v0.7 design) leaves
     every chrome surface on one colour and separates them with edges;
     layered gives each its own step.

     The rule the steps follow, and the reason they are not arbitrary: **tone
     tracks distance from the document.** The paper is the extreme of the
     range, and each surface further out from it moves one step back toward
     mid-grey — title bar, toolbar, side panel, then the desk the paper sits
     on. In light and sepia that means progressively darker going outward; in
     dark it means progressively darker too, because there the paper is the
     *lightest* thing on screen. One rule, read in both directions, so the
     three palettes stay siblings rather than three separate designs.

     Steps are 2–4% apart. Large enough to be seen as a boundary without a
     border, small enough that the window still reads as one object; anything
     bigger and it starts to look like an IDE, which is the thing v0.7 spent a
     whole release getting away from.

     Specificity does the theme matching: `html[data-surface][data-theme=…]`
     (0,2,1) beats the base `html[data-theme=…]` (0,1,1), and plain
     `html[data-surface]` (0,1,1) beats `:root` (0,1,0). No !important, and no
     dependence on source order. */
  :global(html[data-surface="layered"]) {
    --titlebar-bg: #e2dfd7;
    --toolbar-bg: #eae7e0;
    --side-bg: #f1efe9;
    --toolbar-border: rgba(60, 56, 45, 0.09);
    --chrome-sunken: #e4e1da;
  }
  :global(html[data-surface="layered"][data-theme="dark"]) {
    --titlebar-bg: #0a0a09;
    --toolbar-bg: #0f0f0e;
    --side-bg: #131312;
    --toolbar-border: rgba(255, 255, 255, 0.06);
    --chrome-sunken: #080808;
  }
  :global(html[data-surface="layered"][data-theme="sepia"]) {
    --titlebar-bg: #d3c69c;
    --toolbar-bg: #ddd1ad;
    --side-bg: #e5dabc;
    --toolbar-border: rgba(74, 63, 51, 0.11);
    --chrome-sunken: #d6c9a4;
  }

  :global(html), :global(body) {
    margin: 0;
    height: 100%;
    background: var(--bg);
    color: var(--fg);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", "Inter", system-ui, sans-serif;
    font-feature-settings: "kern", "liga", "calt", "ss01";
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  :global(*) { box-sizing: border-box; }
  :global(*::selection) { background: var(--accent-soft); }

  /* Always-visible scrollbars — subtle but actually present, so you can see
     position in long docs at a glance. Slightly bolder on hover. */
  :global(::-webkit-scrollbar) { width: 12px; height: 12px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) {
    background-color: rgba(120, 120, 128, 0.45);
    border: 3px solid transparent;
    border-radius: 8px;
    background-clip: padding-box;
    min-height: 24px;
  }
  :global(::-webkit-scrollbar-thumb:hover) {
    background-color: rgba(120, 120, 128, 0.7);
    background-clip: padding-box;
  }
  :global(::-webkit-scrollbar-thumb:active) {
    background-color: rgba(120, 120, 128, 0.85);
    background-clip: padding-box;
  }
  :global(::-webkit-scrollbar-corner) { background: transparent; }

  /* …except in the side panel, where they are hover-only.
     A permanent bar is right for the document: it is the one place you want
     an at-a-glance sense of position in a long read. In a 20-row outline it
     carries almost no information and sits directly beside the text you are
     scanning, which is exactly where a moving vertical line is most
     distracting. Hiding the *thumb* rather than the scrollbar itself is the
     load-bearing detail: `scrollbar-width: none` would reflow the list every
     time the pointer entered the panel, so instead the track keeps its 12px
     and only the colour appears. Scoped to `.panel-stack` — LeftPanel's
     Files+Outline container, docked or peeking — rather than `.panel`, which
     the Settings dialog also uses. */
  :global(.panel-stack ::-webkit-scrollbar-thumb) {
    background-color: transparent;
  }
  :global(.panel-stack:hover ::-webkit-scrollbar-thumb) {
    background-color: rgba(120, 120, 128, 0.4);
    background-clip: padding-box;
  }
  :global(.panel-stack ::-webkit-scrollbar-thumb:hover) {
    background-color: rgba(120, 120, 128, 0.65);
    background-clip: padding-box;
  }
  :global(.panel-stack ::-webkit-scrollbar-thumb:active) {
    background-color: rgba(120, 120, 128, 0.85);
    background-clip: padding-box;
  }
  /* The diff sidebar is the same kind of surface — chrome beside prose. */
  :global(.diff-sidebar ::-webkit-scrollbar-thumb) { background-color: transparent; }
  :global(.diff-sidebar:hover ::-webkit-scrollbar-thumb) {
    background-color: rgba(120, 120, 128, 0.4);
    background-clip: padding-box;
  }

  :global(button:focus-visible),
  :global(input:focus-visible),
  :global(select:focus-visible),
  :global(a:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  :global(mark.find-hit) { background: #ffe066; color: #111; padding: 0 1px; border-radius: 2px; }
  :global(mark.find-hit.active) { background: #ff9f0a; color: #111; }

  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    /* The desk the paper sits on. */
    background: var(--chrome-bg);
  }

  /* ─── Toolbar ────────────────────────────────────────────────────────
     Opaque, not glass. The v0.6 toolbar carried `backdrop-filter: blur(20px)`
     over a 78%-opaque fill — but it is a flex *sibling* of the content, not an
     overlay, so there was never anything behind it to blur. All the filter
     did was cost a compositor layer and open a stacking context that the File
     menu had to be teleported out of (see the note by .file-menu). Chrome that
     is honestly a surface needs no trick. */
  .toolbar {
    display: flex;
    align-items: center;
    gap: .7rem;
    padding: 0 .6rem;
    height: 46px;
    background: var(--toolbar-bg);
    /* A hairline where the toolbar meets what's below it. `box-shadow` and
       not `border-bottom`, so the row keeps its exact 46px in flat mode where
       the token is transparent — a border would move every layout below it by
       a pixel depending on a colour setting. */
    box-shadow: 0 1px 0 var(--toolbar-border);
    color: var(--chrome-fg);
    user-select: none;
    -webkit-app-region: drag;
    flex-shrink: 0;
    position: relative;
    z-index: 3;
  }
  /* No macOS traffic-light gutter here, deliberately. The window keeps
     `decorations: true`, so on macOS the traffic lights live in a real native
     title bar *above* this toolbar and never overlap it — reserving 68px
     would just open an empty hole at the left of the toolbar on the one
     platform that doesn't need it. If the window is ever switched to an
     overlay/unified title bar, that padding comes back with it, not before.
     `isMac` is still used, for shortcut *labels* (⌘ vs Ctrl). */

  /* Mark all interactive zones as no-drag so click events reach buttons.
     The .middle (centered title) stays as the drag-region. */
  .toolbar .left,
  .toolbar .left *,
  .toolbar .right,
  .toolbar .right * { -webkit-app-region: no-drag; }

  .left, .right {
    display: flex;
    align-items: center;
    gap: .2rem;
  }
  .right { gap: .1rem; }
  .middle {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: .4rem;
    min-width: 0;
    padding: 0 .75rem;
  }
  .muted { color: var(--chrome-fg); opacity: .7; font-size: 12px; }
  /* Vertical divider between toolbar groups so the clusters read as distinct
     rather than one undifferentiated row of buttons (v0.2.0 feedback). */
  .tool-divider {
    width: 1px;
    height: 16px;
    background: var(--chrome-border);
    margin: 0 .25rem;
    flex-shrink: 0;
  }
  .icon-btn {
    height: 30px;
    width: 30px;
    padding: 0;
    color: var(--chrome-fg);
  }
  /* The three standalone actions on the right — focus, find, settings. They
     were 15–17px glyphs in a 32px box, which read as small marks floating in
     space rather than as buttons. */
  .icon-btn.lg {
    height: 32px;
    width: 32px;
  }
  .icon-btn:hover { color: var(--fg-strong); }
  .icon-btn.on { color: var(--accent); background: var(--accent-soft); }
  .icon-btn[disabled] { opacity: .35; cursor: default; }
  .icon-btn[disabled]:hover { background: transparent; color: var(--chrome-fg); }

  /* Refresh. The rotation is the entire feedback this button gives — a
     re-read of a few files finishes in single-digit milliseconds, so without
     a visible turn the click looks like it did nothing at all. The store
     holds `busy` for a minimum spin so that stays true.
     `:global` because the SVG belongs to the Icon component. */
  .refresh-btn :global(svg) {
    transition: transform 160ms ease;
  }
  .refresh-btn:hover :global(svg) { transform: rotate(30deg); }
  .refresh-btn.spinning :global(svg) {
    animation: refresh-spin 700ms cubic-bezier(.4, 0, .2, 1) infinite;
    transition: none;
  }
  @keyframes refresh-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .refresh-btn :global(svg),
    .refresh-btn:hover :global(svg) { transition: none; transform: none; }
    .refresh-btn.spinning :global(svg) { animation: none; opacity: .5; }
  }
  .zoom {
    font-size: 11px;
    color: var(--chrome-fg);
    min-width: 2.9em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* Side-panel toggle — tinted when the pane is open, so the button reads as
     a state indicator rather than a bare action. */
  .pane-btn.pane-open { color: var(--accent); background: var(--accent-soft); }
  .pane-btn.pane-open:hover { color: var(--accent); }

  /* All toolbar buttons share a common shape */
  button {
    background: transparent;
    border: 1px solid transparent;
    color: inherit;
    padding: 0 .5rem;
    height: 28px;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    line-height: 1;
    transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  button:hover { background: var(--chrome-hover); }
  button:active { background: var(--accent-soft); }

  .file-btn { gap: .25rem; color: var(--chrome-fg); }
  .file-btn:hover { color: var(--fg-strong); }
  .file-btn :global(.caret) { opacity: .6; }

  .edit-sub {
    font-size: 11px;
    margin-left: 0;
  }
  .edit-sub button { padding: 0 .55rem; }

  /* Pill segmented control. The track is a *recess* in the chrome (a shade
     darker) and the selected item is a raised chip — the physical metaphor
     macOS and iOS both use. v0.6 lifted the selected chip to `--bg`, which is
     now the paper colour, so the control would have looked like a scrap of
     document lying in the toolbar. */
  .seg {
    display: inline-flex;
    align-items: center;
    background: var(--chrome-sunken);
    border-radius: 8px;
    padding: 2px;
    gap: 2px;
  }
  .seg button {
    border: 0;
    height: 23px;
    padding: 0 .6rem;
    font-size: 12px;
    color: var(--chrome-fg);
    border-radius: 6px;
  }
  .seg button:hover { background: var(--chrome-hover); color: var(--fg-strong); }
  .seg button.active {
    background: var(--chrome-raised);
    color: var(--fg-strong);
    box-shadow: var(--shadow-sm);
    font-weight: 500;
  }
  /* Icon-only segments want square cells, not text-sized ones. */
  .panel-toggles button,
  .theme-group button { width: 27px; padding: 0; }

  .body {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    background: var(--chrome-bg);
    transition: background-color 380ms ease, filter 380ms ease;
  }
  /* Tab strip + paper, stacked. Chrome-coloured so the strip and the cut
     corner below it are the same material. */
  .doc-col {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    background: var(--chrome-bg);
  }
  /* Theatre engaged: subtle global background desaturation + a slight inset
     shadow on the content surface so the page reads as "receded into focus
     mode" without literally shrinking the viewport (the v0.4.0 transform:
     scale approach left a small floating box, which read as broken). */
  .body.theatre-engaged {
    background: var(--bg-edit, var(--bg));
    filter: saturate(.92);
  }
  /* ─── The paper ──────────────────────────────────────────────────────
     The document is a sheet resting on the chrome, not a region of the same
     wall. One rounded corner (top-left, where the sheet meets the panel and
     the tab strip) plus a hairline and a whisper of shadow is the entire
     device — but it is the thing that makes the side panel stop reading as
     "more of the text". The other three corners stay square because they meet
     the window edge, and a sheet floating free of all four edges wastes
     screen on a reader. */
  .content {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--bg);
    border-top-left-radius: var(--paper-radius);
    /* A ring rather than a border: borders participate in flex sizing and
       would shift the text column by a pixel when the panel is toggled. */
    box-shadow: var(--paper-shadow);
    /* Contain the scroller so the rounded corner actually clips content. */
    overflow: hidden;
    transition: box-shadow 380ms cubic-bezier(.4, 0, .2, 1),
                background-color 380ms ease;
  }
  .content.theatre-content {
    box-shadow: var(--paper-shadow),
                inset 0 24px 48px -32px rgba(0, 0, 0, .15);
  }
  :global(html[data-theme="dark"]) .content.theatre-content {
    box-shadow: var(--paper-shadow),
                inset 0 24px 48px -32px rgba(0, 0, 0, .55);
  }

  /* ─── Focus mode ─────────────────────────────────────────────────────
     Everything but the paper leaves. The toolbar is translated out rather
     than unmounted, so pushing the pointer to the top edge can slide it back
     without a remount (and without losing the File menu's open state). */
  .shell.focus-mode { background: var(--bg); }
  .focus-body { padding: 0; }
  .focus-body .content {
    border-top-left-radius: 0;
    box-shadow: none;
  }
  .toolbar.focus-hidden {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 60;
    transform: translateY(-100%);
    opacity: 0;
    pointer-events: none;
    border-bottom: 1px solid var(--chrome-border);
    box-shadow: var(--shadow-md);
    transition: transform 180ms cubic-bezier(.32, .72, 0, 1), opacity 140ms ease;
  }
  .toolbar.focus-peek {
    transform: none;
    opacity: 1;
    pointer-events: auto;
  }

  :global(.focus-hint) {
    position: fixed;
    left: 50%;
    bottom: 34px;
    transform: translateX(-50%);
    z-index: 70;
    display: flex;
    align-items: center;
    gap: .45rem;
    padding: .5rem .9rem;
    border-radius: 999px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-md);
    font-size: 12px;
    color: var(--fg);
    pointer-events: none;
    animation: focus-hint-in 220ms ease-out;
  }
  :global(.focus-hint-sep) { color: var(--border-strong); }
  :global(.focus-hint-dim) { color: var(--muted); }
  :global(.focus-hint kbd) {
    background: var(--muted-bg);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 0 .35em;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: .85em;
  }
  @keyframes focus-hint-in {
    from { opacity: 0; transform: translateX(-50%) translateY(6px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .toolbar.focus-hidden { transition: none; }
    :global(.focus-hint) { animation: none; }
  }
  /* File button & menu */
  /* The caret is an <Icon>, so its class lands inside a child component and
     needs :global to be reachable — see the .file-btn rule above. */
  :global(.menu-backdrop) {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: transparent;
  }
  :global(.file-menu) {
    position: fixed;
    top: 50px;
    left: 16px;
    z-index: 51;
    min-width: 280px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    padding: 4px;
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
  }
  .menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 30px;
    padding: 0 .65rem;
    font-size: 13px;
    color: var(--fg);
    border-radius: var(--radius-sm);
    text-align: left;
  }
  .menu-item:hover:not([disabled]) { background: var(--accent); color: white; }
  .menu-item:hover:not([disabled]) .kbd,
  .menu-item:hover:not([disabled]) .recent-dir { color: rgba(255,255,255,0.85); }
  .menu-item[disabled] { opacity: .4; cursor: default; }
  .menu-item.recent {
    flex-direction: column;
    align-items: flex-start;
    height: auto;
    padding: .35rem .65rem;
    gap: 1px;
  }
  .recent-name { font-size: 13px; }
  .recent-dir { font-size: 11px; color: var(--muted); }
  .menu-label {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--muted);
    padding: .35rem .65rem .15rem;
    font-weight: 600;
  }
  .menu-sep { height: 1px; background: var(--border); margin: 4px 0; }
  .kbd {
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 11px;
    color: var(--muted);
    margin-left: 1rem;
  }

  /* Empty state — shown when no tabs are open */
  .empty-state {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--muted);
    gap: .5rem;
    padding: 2rem;
    background: var(--bg);
  }
  .empty-glyph {
    font-size: 48px;
    color: var(--border-strong, var(--border));
    margin-bottom: .5rem;
    opacity: .6;
  }
  .empty-state h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 500;
    color: var(--fg);
  }
  .empty-state p {
    margin: 0;
    font-size: 13px;
  }
  .empty-state kbd {
    background: var(--muted-bg);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 0 .35em;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: .85em;
  }
  .empty-state code {
    background: var(--code-inline-bg);
    padding: .12em .35em;
    border-radius: 4px;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: .9em;
  }
  .empty-recent {
    margin-top: 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: min(420px, 80%);
  }
  .empty-label {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--muted);
    font-weight: 600;
    text-align: left;
    padding: 0 .5rem .25rem;
  }
  .empty-recent-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    align-items: flex-start;
    padding: .45rem .65rem;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--fg);
    text-align: left;
    cursor: pointer;
    font-size: 13px;
  }
  .empty-recent-item:hover { background: var(--accent); color: white; }
  .empty-recent-item:hover .dim { color: rgba(255,255,255,0.85); }
  .empty-recent-item .dim { font-size: 11px; color: var(--muted); }

  /* (Smart-diff inline banner CSS removed in v0.3.0. v0.4.0 reintroduces
     LLM-summarised diffs via the per-section sidebar — see proposal.) */
</style>
