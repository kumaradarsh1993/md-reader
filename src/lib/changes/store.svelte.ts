/**
 * The Changes store — "any and all files touched since I last read them".
 *
 * ## How a change is noticed
 *
 * By **scanning**, not by watching. `scan_markdown_tree` reports every markdown
 * file under a folder with its mtime and size; anything whose mtime or size has
 * moved since the recorded baseline gets read and diffed. The reasons are in
 * the Rust doc comment, but the short version is that a scan cannot miss an
 * event it never received, and OneDrive drops events.
 *
 * Scans run when the window regains focus, on manual refresh, and when a folder
 * is opened. All three already exist as signals in the app.
 *
 * ## What counts as changed, and when it stops counting
 *
 * A revision is unreviewed from the moment it is observed until the reader
 * *acts*. There is no timer anywhere in this file, on purpose: the previous
 * attempt decayed highlights after 1.5 seconds, and information vanishing on a
 * schedule the reader did not set is precisely what made it feel arbitrary.
 *
 * Reviewing happens by opening a change, or by asking for a file or the whole
 * list to be marked read. Scrolling past does not count — scrolling is not
 * reading, and auto-clearing would silently destroy the only record there is.
 */

import { api } from "../api";
import { settings } from "../settings-store.svelte";
import { diffRegions } from "./regions";
import { loadBaseline, loadIndex, saveBaseline, saveIndex, splitPath } from "./sidecar";
import {
  MAX_DIFF_BYTES,
  REVISION_CAP,
  changedSinceRead,
  lastChangedAt,
  unreviewedCount,
  type FileChanges,
  type Revision,
} from "./types";

/** How deep a scan walks from the folder the reader is browsing. Deep enough
 *  for a project laid out in sub-folders, shallow enough that pointing Fox MD
 *  at a home directory does not turn into a filesystem crawl. */
const SCAN_DEPTH = 4;

/** Scans closer together than this are dropped. Window focus can fire more
 *  than once per activation, and the sweep does real file I/O. */
const COALESCE_MS = 1500;

export interface ChangeEntry {
  path: string;
  name: string;
  revision: Revision;
}

class ChangesStore {
  /** Per-folder file state, keyed by absolute file path. */
  files = $state<Record<string, FileChanges>>({});
  /** Folders that have been scanned this session, so a rescan knows where. */
  private folders = new Set<string>();
  /** True while a scan is running — the toolbar badge uses it for a subtle
   *  busy state rather than a spinner nobody asked for. */
  scanning = $state(false);
  /** Bumped after every completed scan so views can re-derive. */
  tick = $state(0);

  private lastScanAt = 0;
  private inFlight: Promise<void> | null = null;

  // ─── Queries ────────────────────────────────────────────────────────────

  get enabled(): boolean {
    return settings.s.trackChanges !== false;
  }

  forFile(path: string): FileChanges | undefined {
    return this.files[path];
  }

  /** Unreviewed revisions for one file, newest first. */
  revisionsFor(path: string): Revision[] {
    return this.files[path]?.revisions ?? [];
  }

  unreviewedFor(path: string): number {
    return unreviewedCount(this.files[path]);
  }

  /** Everything unreviewed, across every folder scanned this session. */
  get inbox(): ChangeEntry[] {
    const out: ChangeEntry[] = [];
    for (const f of Object.values(this.files)) {
      const name = splitPath(f.path)?.name ?? f.path;
      for (const r of f.revisions) {
        if (!r.reviewed) out.push({ path: f.path, name, revision: r });
      }
    }
    return out.sort((a, b) => b.revision.at - a.revision.at);
  }

  get totalUnreviewed(): number {
    let n = 0;
    for (const f of Object.values(this.files)) n += unreviewedCount(f);
    return n;
  }

  /** Files with something unread, most recently changed first. */
  get changedFiles(): FileChanges[] {
    return Object.values(this.files)
      .filter((f) => unreviewedCount(f) > 0 || changedSinceRead(f))
      .sort((a, b) => lastChangedAt(b) - lastChangedAt(a));
  }

  // ─── Detection ──────────────────────────────────────────────────────────

  /**
   * Adopt a file the reader has just opened.
   *
   * Two jobs. It records that the file has been read *now*, which is the
   * reference point the whole feature is defined against. And if the file has
   * no baseline yet it writes one, so that from this moment on the file is
   * trackable — a document Fox MD has never seen has no "before", and no amount
   * of cleverness can invent one.
   */
  async noteOpened(path: string, content: string, mtime: number | null): Promise<void> {
    if (!this.enabled) return;
    const s = splitPath(path);
    if (!s) return;
    await this.ensureFolder(s.folder);

    const existing = this.files[path];
    const baseline = await loadBaseline(path);

    if (baseline === null) {
      // First sighting. Not a change — there is nothing to compare against, and
      // reporting "this whole file is new" the first time you open anything
      // would make the feature noise on day one.
      await saveBaseline(path, content);
      this.files[path] = {
        path,
        seenMtime: mtime,
        seenSize: byteLength(content),
        lastReadAt: Date.now(),
        revisions: existing?.revisions ?? [],
      };
    } else {
      // Opened a file that changed while it was closed and before any scan saw
      // it — record that first, or opening the file would quietly swallow it.
      if (baseline !== content) {
        await this.record(path, baseline, content, mtime, false);
      }
      const f = this.files[path];
      if (f) f.lastReadAt = Date.now();
    }
    await this.persist(s.folder);
  }

  /** The reader edited the file here. Move the baseline forward without
   *  recording anything: you do not need to be told what you just typed. */
  async noteLocalEdit(path: string, content: string): Promise<void> {
    if (!this.enabled) return;
    const s = splitPath(path);
    if (!s) return;
    await saveBaseline(path, content);
    const f = this.files[path];
    if (f) {
      f.seenSize = byteLength(content);
      f.seenMtime = Date.now();
      f.lastReadAt = Date.now();
    }
    await this.persist(s.folder);
  }

  /**
   * Sweep every known folder for files that moved.
   *
   * `reason` only affects coalescing: a focus sweep that arrives on the heels
   * of another is dropped, a sweep the reader asked for always runs.
   */
  async scan(reason: "focus" | "user" | "open" = "focus"): Promise<void> {
    if (!this.enabled) return;
    if (this.inFlight) return this.inFlight;
    const now = Date.now();
    if (reason === "focus" && now - this.lastScanAt < COALESCE_MS) return;
    this.lastScanAt = now;

    const work = (async () => {
      this.scanning = true;
      try {
        for (const folder of [...this.folders]) {
          await this.scanFolder(folder);
        }
        this.tick++;
      } catch (e) {
        console.error("[Fox MD] change scan failed", e);
      } finally {
        this.scanning = false;
        this.inFlight = null;
        this.lastScanAt = Date.now();
      }
    })();
    this.inFlight = work;
    return work;
  }

  /** Start tracking a folder (called when one is browsed or a file opened). */
  async track(folder: string): Promise<void> {
    if (!this.enabled || !folder) return;
    if (this.folders.has(folder)) return;
    await this.ensureFolder(folder);
    await this.scanFolder(folder);
    this.tick++;
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (this.folders.has(folder)) return;
    this.folders.add(folder);
    const stored = await loadIndex(folder);
    for (const [path, state] of Object.entries(stored)) {
      // Anything already in memory has been observed this session and is at
      // least as current as what is on disk.
      if (!this.files[path]) this.files[path] = state;
    }
  }

  private async scanFolder(folder: string): Promise<void> {
    let found: Array<{ path: string; modified: number | null; size: number }>;
    try {
      found = await api.scanMarkdownTree(folder, SCAN_DEPTH);
    } catch {
      // A folder that has gone away (unmounted drive, deleted project) is not
      // an error worth surfacing — it just has nothing to report.
      return;
    }

    let dirty = false;
    for (const hit of found) {
      const known = this.files[hit.path];
      // Only files the reader has met are tracked; see the sidecar's note on
      // why a never-opened file has no baseline to diff against.
      if (!known) continue;
      const unchanged = known.seenMtime === hit.modified && known.seenSize === hit.size;
      if (unchanged) continue;

      const baseline = await loadBaseline(hit.path);
      if (baseline === null) continue;
      let content: string;
      try {
        content = (await api.openFile(hit.path)).content;
      } catch {
        continue;
      }
      if (content === baseline) {
        // mtime moved but the bytes did not — a sync round-trip, or a save that
        // rewrote identical content. Re-stamp so it is not re-read every scan.
        known.seenMtime = hit.modified;
        known.seenSize = hit.size;
        dirty = true;
        continue;
      }
      await this.record(hit.path, baseline, content, hit.modified, false);
      dirty = true;
    }
    if (dirty) await this.persist(folder);
  }

  /**
   * Record one transition and move the baseline forward.
   *
   * `at` is the file's mtime when there is one — the moment the edit actually
   * happened, not the moment this code noticed. See `types.ts`.
   */
  private async record(
    path: string,
    before: string,
    after: string,
    mtime: number | null,
    isNew: boolean,
  ): Promise<void> {
    const f = this.files[path];
    const tooBig = after.length > MAX_DIFF_BYTES || before.length > MAX_DIFF_BYTES;
    const regions = tooBig ? [] : diffRegions(before, after);
    // A diff that produced nothing visible (whitespace at the end of the file,
    // a line-ending flip) is not worth a row in the reader's inbox.
    if (!isNew && !tooBig && regions.length === 0) {
      await saveBaseline(path, after);
      if (f) {
        f.seenMtime = mtime;
        f.seenSize = byteLength(after);
      }
      return;
    }

    const nextId = (f?.revisions[0]?.id ?? 0) + 1;
    const revision: Revision = {
      id: nextId,
      at: mtime ?? Date.now(),
      origin: "external",
      regions,
      reviewed: false,
      ...(isNew ? { isNew: true } : {}),
      ...(tooBig ? { truncated: true } : {}),
    };

    const revisions = [revision, ...(f?.revisions ?? [])].slice(0, REVISION_CAP);
    this.files[path] = {
      path,
      seenMtime: mtime,
      seenSize: byteLength(after),
      lastReadAt: f?.lastReadAt ?? null,
      revisions,
    };
    await saveBaseline(path, after);
  }

  // ─── Reviewing ──────────────────────────────────────────────────────────

  async markRevisionReviewed(path: string, id: number): Promise<void> {
    const f = this.files[path];
    if (!f) return;
    const r = f.revisions.find((x) => x.id === id);
    if (!r || r.reviewed) return;
    r.reviewed = true;
    await this.persistFor(path);
  }

  async markFileReviewed(path: string): Promise<void> {
    const f = this.files[path];
    if (!f) return;
    let touched = false;
    for (const r of f.revisions) {
      if (!r.reviewed) {
        r.reviewed = true;
        touched = true;
      }
    }
    f.lastReadAt = Date.now();
    if (touched) await this.persistFor(path);
  }

  async markAllReviewed(): Promise<void> {
    const folders = new Set<string>();
    for (const f of Object.values(this.files)) {
      for (const r of f.revisions) r.reviewed = true;
      const s = splitPath(f.path);
      if (s) folders.add(s.folder);
    }
    for (const folder of folders) await this.persist(folder);
  }

  /** Forget a file's history entirely and re-baseline from what is on disk. */
  async forget(path: string): Promise<void> {
    const f = this.files[path];
    if (!f) return;
    f.revisions = [];
    await this.persistFor(path);
  }

  private async persistFor(path: string): Promise<void> {
    const s = splitPath(path);
    if (s) await this.persist(s.folder);
  }

  /** Write one folder's slice of the index back to disk. */
  private async persist(folder: string): Promise<void> {
    const slice: Record<string, FileChanges> = {};
    const prefix = folder.endsWith("\\") || folder.endsWith("/") ? folder : folder + pathSep(folder);
    for (const [path, f] of Object.entries(this.files)) {
      if (path.startsWith(prefix)) slice[path] = f;
    }
    if (Object.keys(slice).length === 0) return;
    try {
      const merged = await saveIndex(folder, slice);
      // Adopt whatever the merge produced, so a sibling window's observations
      // become visible here rather than being written over on the next save.
      for (const [path, f] of Object.entries(merged)) this.files[path] = f;
    } catch (e) {
      console.error("[Fox MD] could not write the changes index", e);
    }
  }
}

function pathSep(p: string): string {
  return p.includes("\\") ? "\\" : "/";
}

/** UTF-8 byte length, to match what the filesystem reports as a size. */
function byteLength(s: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  return s.length;
}

export const changes = new ChangesStore();
