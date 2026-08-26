/**
 * Annotation state for the document currently on screen.
 *
 * One document at a time, deliberately: annotations are only ever painted for
 * the visible tab, and holding every open tab's set in memory would mean an
 * autosave race between tabs pointed at the same file in two windows.
 * Switching tabs flushes the outgoing document's pending write before loading
 * the incoming one — the same discipline the scroll marks use, for the same
 * reason.
 *
 * ## Auto-save
 *
 * Every mutation schedules a write 600ms later, and any further change inside
 * that window resets the timer, so typing a paragraph of feedback is one write
 * rather than one per keystroke. The pending write is force-flushed on tab
 * switch, on `beforeunload`, on `pagehide`, and when the window is hidden —
 * because the realistic way to lose a comment is to close the app immediately
 * after writing it.
 */

import { api } from "../api";
import { loadNotes, saveNotes } from "./sidecar";
import { hasFill, hasThread, newId, walkThread, type Annotation, type CommentNode, type HighlightColor } from "./types";

const SAVE_DEBOUNCE = 600;

class AnnotationStore {
  /** Absolute path of the document these annotations belong to. */
  path = $state("");
  annotations = $state<Annotation[]>([]);
  /** Ids that could not be found in the current text. Shown, never deleted. */
  detached = $state<string[]>([]);
  /** Which thread is expanded in the margin. One at a time keeps the lane
   *  readable; the user asked for click-to-expand, not an always-open list. */
  expandedId = $state<string | null>(null);
  /** Set briefly after a write so the UI can say "saved" rather than nothing. */
  lastSavedAt = $state(0);
  saving = $state(false);

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The path a pending write belongs to — not necessarily the current one. */
  private pendingPath = "";
  private loadToken = 0;

  get count(): number {
    return this.annotations.length;
  }

  get commentCount(): number {
    return this.annotations.filter((a) => a.thread.length > 0).length;
  }

  byId(id: string): Annotation | undefined {
    return this.annotations.find((a) => a.id === id);
  }

  /** Point the store at a different document. Flushes the old one first. */
  async open(path: string) {
    if (path === this.path) return;
    await this.flush();
    const token = ++this.loadToken;
    this.path = path;
    this.annotations = [];
    this.detached = [];
    this.expandedId = null;
    if (!path) return;
    const loaded = await loadNotes(path);
    // A slow disk plus a fast Ctrl+Tab would otherwise paint the previous
    // document's notes onto the new one.
    if (token !== this.loadToken) return;
    this.annotations = loaded;
  }

  private touch() {
    this.pendingPath = this.path;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE);
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const path = this.pendingPath;
    if (!path) return;
    this.pendingPath = "";
    const snapshot = path === this.path ? [...this.annotations] : [...this.annotations];
    this.saving = true;
    try {
      await saveNotes(path, snapshot);
      this.lastSavedAt = Date.now();
    } catch (e) {
      console.error("[Fox MD] could not write notes sidecar", e);
      // Put the write back on the queue: a transient failure (OneDrive holding
      // the file open mid-sync is the realistic one) must not silently discard
      // the user's feedback.
      this.pendingPath = path;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush(), 4000);
    } finally {
      this.saving = false;
    }
  }

  // ─── Mutations ───────────────────────────────────────────────────────

  addHighlight(anchor: Annotation["anchor"], color: HighlightColor): Annotation {
    const now = Date.now();
    const ann: Annotation = {
      id: newId(),
      kind: "highlight",
      color,
      anchor,
      thread: [],
      createdAt: now,
      updatedAt: now,
      resolved: false,
    };
    this.annotations = [...this.annotations, ann];
    this.touch();
    return ann;
  }

  /**
   * Anchor a comment.
   *
   * **Created with no fill.** Commenting on a passage is not highlighting it,
   * and forcing a highlighter colour on every comment was the original design
   * mistake here — the reader ends up with five colours of paint they never
   * asked for. The passage is marked as *commented* (a rule under the text,
   * see paint.ts), which is a different mark for a different act. Adding a
   * fill afterwards is one click, and stays optional.
   */
  addComment(anchor: Annotation["anchor"], author: string, body: string): Annotation {
    const ann = this.startComment(anchor);
    this.reply(ann.id, null, author, body);
    return ann;
  }

  /** An anchored comment with nothing written in it yet — the state between
   *  choosing "Comment" and typing. Carries no fill. */
  startComment(anchor: Annotation["anchor"]): Annotation {
    const now = Date.now();
    const ann: Annotation = {
      id: newId(),
      kind: "comment",
      color: null,
      anchor,
      thread: [],
      createdAt: now,
      updatedAt: now,
      resolved: false,
    };
    this.annotations = [...this.annotations, ann];
    this.touch();
    return ann;
  }

  /**
   * Remove the highlighter fill.
   *
   * **A thread is never collateral damage.** Clearing formatting must not
   * delete what someone wrote: if the mark carries a comment it keeps it and
   * simply loses its colour. Only a bare highlight — nothing said about it —
   * disappears entirely, which is what "No highlight" means for it.
   */
  clearFill(annId: string): void {
    const ann = this.byId(annId);
    if (!ann) return;
    if (!hasThread(ann)) {
      this.remove(annId);
      return;
    }
    ann.color = null;
    ann.updatedAt = Date.now();
    this.annotations = [...this.annotations];
    this.touch();
  }

  /** "No highlight" over a run of text: clear every mark it touches, in one
   *  undoable-looking step rather than one call per mark. */
  clearFillFor(ids: string[]): number {
    if (ids.length === 0) return 0;
    const set = new Set(ids);
    let cleared = 0;
    const kept: Annotation[] = [];
    for (const ann of this.annotations) {
      if (!set.has(ann.id)) { kept.push(ann); continue; }
      if (!hasFill(ann) && !hasThread(ann)) { cleared += 1; continue; }
      if (!hasThread(ann)) { cleared += 1; continue; }   // bare highlight: gone
      if (hasFill(ann)) {
        ann.color = null;
        ann.updatedAt = Date.now();
        cleared += 1;
      }
      kept.push(ann);
    }
    if (cleared === 0) return 0;
    for (const id of ids) if (this.expandedId === id && !kept.some((a) => a.id === id)) this.expandedId = null;
    this.annotations = kept;
    this.touch();
    return cleared;
  }

  /** Append a note. `parentId` null adds at the top level of the thread. */
  reply(annId: string, parentId: string | null, author: string, body: string): CommentNode | null {
    const text = body.trim();
    if (!text) return null;
    const ann = this.byId(annId);
    if (!ann) return null;
    const node: CommentNode = {
      id: newId(),
      author,
      body: text,
      createdAt: Date.now(),
      replies: [],
    };
    if (parentId === null) {
      ann.thread.push(node);
    } else {
      let parent: CommentNode | null = null;
      walkThread(ann.thread, (n) => { if (n.id === parentId) parent = n; });
      if (!parent) return null;
      (parent as CommentNode).replies.push(node);
    }
    // `kind` is deliberately NOT touched: adding a note to a highlight does not
    // turn it into something else, and a comment does not acquire a fill. The
    // two properties are independent — see the Annotation docs.
    ann.updatedAt = Date.now();
    this.annotations = [...this.annotations];
    this.touch();
    return node;
  }

  editNote(annId: string, noteId: string, body: string): boolean {
    const text = body.trim();
    if (!text) return false;
    const ann = this.byId(annId);
    if (!ann) return false;
    let hit = false;
    walkThread(ann.thread, (n) => {
      if (n.id !== noteId) return;
      n.body = text;
      n.updatedAt = Date.now();
      hit = true;
    });
    if (!hit) return false;
    ann.updatedAt = Date.now();
    this.annotations = [...this.annotations];
    this.touch();
    return true;
  }

  /**
   * Delete one note.
   *
   * Its replies go with it — an orphaned reply to a deleted note is worse than
   * no reply, because it reads as a response to whatever now sits above it.
   *
   * Deleting the last note leaves the highlight behind **if there is one**, so
   * a passage you had also painted stays painted. If the mark had no fill —
   * it was only ever a comment — there is nothing left for it to be, and it
   * goes.
   */
  deleteNote(annId: string, noteId: string): void {
    const ann = this.byId(annId);
    if (!ann) return;
    const prune = (nodes: CommentNode[]): CommentNode[] =>
      nodes.filter((n) => n.id !== noteId).map((n) => ({ ...n, replies: prune(n.replies) }));
    ann.thread = prune(ann.thread);
    if (ann.thread.length === 0) {
      if (!hasFill(ann)) {
        this.remove(annId);
        return;
      }
      ann.resolved = false;
    }
    ann.updatedAt = Date.now();
    this.annotations = [...this.annotations];
    this.touch();
  }

  remove(annId: string): void {
    this.annotations = this.annotations.filter((a) => a.id !== annId);
    if (this.expandedId === annId) this.expandedId = null;
    this.touch();
  }

  /** `null` clears the fill; see `clearFill` for why that can delete the mark. */
  setColor(annId: string, color: HighlightColor | null): void {
    if (color === null) { this.clearFill(annId); return; }
    const ann = this.byId(annId);
    if (!ann) return;
    ann.color = color;
    ann.updatedAt = Date.now();
    this.annotations = [...this.annotations];
    this.touch();
  }

  toggleResolved(annId: string): void {
    const ann = this.byId(annId);
    if (!ann) return;
    ann.resolved = !ann.resolved;
    ann.updatedAt = Date.now();
    this.annotations = [...this.annotations];
    this.touch();
  }

  /** A repaired anchor is persisted so the next open takes the cheap path. */
  updateAnchor(annId: string, anchor: Annotation["anchor"]): void {
    const ann = this.byId(annId);
    if (!ann) return;
    ann.anchor = anchor;
    this.annotations = [...this.annotations];
    this.touch();
  }

  setDetached(ids: string[]): void {
    // Compared as a set so an identical result doesn't retrigger every effect
    // that reads it once per render.
    if (ids.length === this.detached.length && ids.every((id, i) => this.detached[i] === id)) return;
    this.detached = ids;
  }

  toggleExpanded(annId: string): void {
    this.expandedId = this.expandedId === annId ? null : annId;
  }
}

export const annotations = new AnnotationStore();

if (typeof window !== "undefined") {
  const flush = () => void annotations.flush();
  window.addEventListener("beforeunload", flush);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** Who a new note is attributed to. Resolved once, lazily. */
let cachedAuthor = "";
export async function defaultAuthor(): Promise<string> {
  if (cachedAuthor) return cachedAuthor;
  try {
    cachedAuthor = (await api.userDisplayName()) || "Me";
  } catch {
    cachedAuthor = "Me";
  }
  return cachedAuthor;
}
