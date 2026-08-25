/**
 * Manual "re-read everything from disk" — the toolbar refresh button, Ctrl+R /
 * F5, and the automatic sweep that runs whenever this window regains focus.
 *
 * Why the app needs one at all: the Rust watcher (`watcher.rs`) arms itself on
 * a single file, the *active* tab, and emits changes for that path only. That
 * covers the case it was written for — you are reading a file while something
 * else edits it — and nothing else. Three everyday situations fall straight
 * through it:
 *
 *  - a background tab whose file changed while you were in another tab;
 *  - a new file appearing in the folder you are browsing (the listing is read
 *    once, when the directory is opened);
 *  - any change on a synced/virtual filesystem — OneDrive, Dropbox, network
 *    shares — where `ReadDirectoryChangesW` is documented as unreliable and
 *    the mtime poll can only cover the one file it is pointed at.
 *
 * So this is not "a button that does what the watcher already does". It is the
 * escape hatch for everything the watcher structurally cannot see, and it is
 * wired to window focus because the shape of the problem is nearly always
 * "an agent or editor changed things while Fox MD was in the background".
 *
 * Windows are separate OS processes (see `spawn_window`), so a refresh cannot
 * reach across them — which is exactly why the focus sweep matters: each window
 * refreshes itself the moment you look at it.
 *
 * v0.8.0+.
 */

import { tabs } from "./tabs-store.svelte";

/** Focus-triggered sweeps closer together than this are dropped. Clicking back
 *  into the window can fire `focus` more than once (webview + document), and
 *  alt-tabbing twice in a second is not two intentions. */
const COALESCE_MS = 400;

/** A user-triggered refresh holds the spinner at least this long. Re-reading a
 *  handful of files takes single-digit milliseconds; without a floor the icon
 *  would flick and the click would feel like it did nothing. */
const SPIN_MS = 420;

export interface RefreshResult {
  /** Tabs whose content actually differed from what was on screen. */
  changed: number;
  /** Tabs left alone because they hold unsaved edits. */
  skipped: number;
  /** Tabs whose file could not be read (moved, deleted, offline). */
  missing: number;
}

class Refresher {
  /** Bumped once per completed refresh. Directory listings watch this to
   *  re-read the folder; it is a counter rather than a callback registry so a
   *  component can subscribe simply by reading it inside an effect. */
  tick = $state(0);
  /** True while a *user-triggered* refresh is in flight — drives the button's
   *  spin. Focus sweeps deliberately leave it false: silent is the point. */
  busy = $state(false);
  /** Outcome of the last refresh, for the toolbar tooltip. */
  last = $state<RefreshResult | null>(null);

  private lastAt = 0;
  private inFlight: Promise<void> | null = null;

  /**
   * `"user"` — the button, the menu item, the shortcut. Always runs, and spins.
   * `"focus"` — the window came forward. Coalesced, and silent.
   */
  async run(reason: "user" | "focus" = "user"): Promise<void> {
    const now = Date.now();
    if (reason === "focus" && now - this.lastAt < COALESCE_MS) return;
    if (this.inFlight) return this.inFlight;
    this.lastAt = now;
    if (reason === "user") this.busy = true;

    const work = (async () => {
      try {
        this.last = await tabs.reloadAllFromDisk();
        // Bumped last, and unconditionally: the folder listing is stale
        // whether or not any open tab's bytes changed — a brand new file next
        // to the one you are reading is the single most common case.
        this.tick++;
      } catch (e) {
        console.error("[Fox MD] refresh failed", e);
      } finally {
        if (reason === "user") {
          const held = Date.now() - now;
          if (held < SPIN_MS) await new Promise((r) => setTimeout(r, SPIN_MS - held));
          this.busy = false;
        }
        this.lastAt = Date.now();
        this.inFlight = null;
      }
    })();

    this.inFlight = work;
    return work;
  }
}

export const refresher = new Refresher();
