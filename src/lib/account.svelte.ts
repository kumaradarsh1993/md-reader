/**
 * Account and handover, from the frontend's side of the wall.
 *
 * **The webview never holds a token.** It asks Rust "am I signed in?" and gets
 * back a name and an email; every request that carries credentials is made in
 * Rust. That boundary is not ceremony — this app renders arbitrary markdown
 * with raw HTML enabled, and a session reachable from the page would be a
 * session reachable from a document someone sent you. See `src-tauri/src/
 * supabase.rs`.
 *
 * ## What gets published
 *
 * Every open tab: its path, title, the markdown itself, and the reading
 * position. Closing a tab removes its row, because the list means "what is open
 * now" — a phone showing a document you finished with yesterday is worse than
 * one showing nothing.
 */

import { invoke } from "@tauri-apps/api/core";
import { settings } from "./settings-store.svelte";
import { tabs } from "./tabs-store.svelte";

export interface AccountState {
  signed_in: boolean;
  email: string | null;
  name: string | null;
  user_id: string | null;
  error: string | null;
}

export interface PushResult {
  pushed: number;
  removed: number;
  oversize: number;
  device_id: string;
}

/** Documents above this are listed on the phone but not carried to it. */
const MAX_SYNC_BYTES = 256 * 1024;

/**
 * Debounce for the automatic push.
 *
 * Long enough that typing, or an agent rewriting a file line by line, is one
 * upload rather than fifty. Short enough that walking away from the laptop and
 * picking up the phone finds the current text — which is the entire use case,
 * so erring long here would defeat the feature.
 */
const PUSH_DEBOUNCE = 2500;

class AccountStore {
  state = $state<AccountState>({
    signed_in: false, email: null, name: null, user_id: null, error: null,
  });
  busy = $state(false);
  /** Result of the last push, for the Settings panel. */
  lastPush = $state<PushResult | null>(null);
  lastPushAt = $state(0);
  pushError = $state<string | null>(null);
  syncing = $state(false);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  /** Set while a push is running and another change arrives. */
  private again = false;

  async refresh() {
    try {
      this.state = await invoke<AccountState>("account_state");
    } catch (e) {
      this.state = { signed_in: false, email: null, name: null, user_id: null, error: String(e) };
    }
  }

  async signIn() {
    this.busy = true;
    try {
      this.state = await invoke<AccountState>("account_sign_in");
      this.pushError = null;
      // Publish immediately: the point of signing in is that the phone can see
      // this machine, and waiting for the next edit would look like nothing
      // happened.
      await this.pushNow();
    } catch (e) {
      this.state = { ...this.state, error: String(e) };
    } finally {
      this.busy = false;
    }
  }

  async signOut() {
    this.busy = true;
    try {
      await invoke("account_sign_out");
      this.state = { signed_in: false, email: null, name: null, user_id: null, error: null };
      this.lastPush = null;
      this.pushError = null;
    } catch (e) {
      this.state = { ...this.state, error: String(e) };
    } finally {
      this.busy = false;
    }
  }

  /** Called whenever the open set or its content changes. */
  schedulePush() {
    if (!this.state.signed_in || !settings.s.handoverEnabled) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.pushNow(), PUSH_DEBOUNCE);
  }

  async pushNow(): Promise<void> {
    if (!this.state.signed_in || !settings.s.handoverEnabled) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    // Never two at once: concurrent upserts of the same rows race, and the
    // delete-what-is-missing step could remove a row the other push just wrote.
    if (this.inFlight) { this.again = true; return; }

    this.inFlight = true;
    this.syncing = true;
    try {
      const payload = tabs.tabs.map((t, i) => ({
        doc_id: docIdFor(t.path),
        path: t.path,
        title: titleOf(t.source) || t.path.split(/[\\/]/).pop() || "Untitled",
        // Oversize documents publish their metadata only; the phone says so
        // rather than showing an empty document.
        content: byteLength(t.source) > MAX_SYNC_BYTES ? "" : t.source,
        notes_json: null,
        tab_index: i,
        is_active: t.id === tabs.activeId,
        scroll: 0,
      }));
      const result = await invoke<PushResult>("handover_push", {
        label: settings.s.deviceLabel ?? "",
        tabs: payload,
      });
      this.lastPush = result;
      this.lastPushAt = Date.now();
      this.pushError = null;
    } catch (e) {
      const msg = String(e);
      this.pushError = msg;
      // Rust clears the session only on an explicit rejection, so this is the
      // one message that means "actually signed out" rather than "offline".
      if (msg.includes("session expired") || msg.includes("Not signed in")) {
        await this.refresh();
      }
    } finally {
      this.inFlight = false;
      this.syncing = false;
      if (this.again) { this.again = false; void this.pushNow(); }
    }
  }
}

/** A stable id for a document, derived from its absolute path.
 *
 *  FNV-1a rather than a crypto hash: this is a *key*, not a secret, and it has
 *  to be computable identically on the phone from the same path. Hex-encoded so
 *  it is safe inside a PostgREST filter list. */
export function docIdFor(path: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Path length joins the hash: two different paths colliding on 32 bits is
  // unlikely, and colliding on 32 bits *and* the same length is not worth
  // worrying about for one person's open documents.
  return `${h.toString(16).padStart(8, "0")}${path.length.toString(16)}`;
}

/** UTF-8 byte length — `String.length` counts UTF-16 units and under-reports
 *  by half for scripts outside the BMP, which is the wrong side to be wrong on
 *  when deciding whether something fits. */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** First heading, as the label. Mirrors the phone's `MarkdownRenderer.titleOf`. */
export function titleOf(source: string): string {
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#") && line.includes(" ")) {
      const t = line.replace(/^#+/, "").trim();
      if (t) return t;
    }
  }
  return "";
}

export const account = new AccountStore();
