/**
 * Live Edit Theatre store — drives the per-tab state machine, manages the
 * 10-turn ring buffer, and exposes helpers the UI components call.
 *
 * State lives on each `Tab` object (see tabs-store.svelte.ts) so it's
 * automatically reactive via Svelte 5 runes. This module is stateless
 * apart from a few non-reactive per-tab timers (setTimeout handles) kept
 * in a Map by tabId.
 */

import { settings } from "../settings-store.svelte";
import type { Tab } from "../tabs-store.svelte";
import type { Turn } from "./types";

const RING_CAP = 10;
const IDLE_MS_DEFAULT = 5000;
const ZOOM_ANIM_MS = 380;

// Monotonic turn IDs scoped per tab. Stored here (not on Tab) because
// it's mechanical bookkeeping that doesn't need reactivity.
const nextTurnIdByTab = new Map<string, number>();

// Per-tab debounce timers, swapped out as new edits arrive.
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Per-tab phase-transition timers (engaging → engaged, resuming → off).
const phaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getIdleMs(): number {
  // Hook for future user-configurable debounce (Settings → Advanced).
  return IDLE_MS_DEFAULT;
}

function nextTurnId(tabId: string): number {
  const cur = nextTurnIdByTab.get(tabId) ?? 1;
  nextTurnIdByTab.set(tabId, cur + 1);
  return cur;
}

/** Called from tabs-store.setActiveSourceFromDisk *before* the source mutates. */
export function onBeforeExternalEdit(tab: Tab): void {
  if (!settings.s.advancedLiveEditTheatre) return;
  // If currently "off" or "resuming", we'll be opening a new turn. Capture
  // the pre-edit source as the upcoming turn's baseline.
  if (tab.theatrePhase === "off" || tab.theatrePhase === "resuming") {
    tab.pendingTurnBefore = tab.source;
  }
  // If in "done", an incoming edit means the same turn is continuing —
  // we don't move pendingTurnBefore (still points at the original baseline).
}

/** Called from tabs-store.setActiveSourceFromDisk *after* the source mutates. */
export function onAfterExternalEdit(tab: Tab): void {
  if (!settings.s.advancedLiveEditTheatre) return;

  switch (tab.theatrePhase) {
    case "off":
    case "resuming":
      // Phase transition: off → engaging → (anim) → engaged.
      tab.theatrePhase = "engaging";
      tab.selectedView = "live";
      clearPhaseTimer(tab.id);
      phaseTimers.set(
        tab.id,
        setTimeout(() => {
          // If user immediately dismissed, don't override.
          if (tab.theatrePhase === "engaging") tab.theatrePhase = "engaged";
        }, ZOOM_ANIM_MS),
      );
      break;
    case "done":
      // Same turn continuing — back to engaged, idle timer re-armed below.
      tab.theatrePhase = "engaged";
      break;
    case "engaging":
    case "engaged":
      // Already in turn — just re-arm idle timer.
      break;
  }
  armIdle(tab);
}

/** Restart the "edits-done" debounce timer for this tab. */
function armIdle(tab: Tab): void {
  const existing = idleTimers.get(tab.id);
  if (existing) clearTimeout(existing);
  idleTimers.set(
    tab.id,
    setTimeout(() => {
      finaliseTurn(tab);
    }, getIdleMs()),
  );
}

/** Idle debounce fired — turn is done. Push to ring buffer, transition to "done". */
function finaliseTurn(tab: Tab): void {
  if (tab.theatrePhase !== "engaged" && tab.theatrePhase !== "engaging") return;
  if (tab.pendingTurnBefore === null) return;
  // Guard: if nothing actually changed (rare race), skip.
  if (tab.pendingTurnBefore === tab.source) {
    tab.theatrePhase = "off";
    tab.pendingTurnBefore = null;
    return;
  }

  const turn: Turn = {
    id: nextTurnId(tab.id),
    startedAt: Date.now() - (Date.now() - Date.now()), // (kept simple)
    finishedAt: Date.now(),
    snapshotBefore: tab.pendingTurnBefore,
    snapshotAfter: tab.source,
  };

  tab.turns = [turn, ...tab.turns].slice(0, RING_CAP);
  tab.selectedView = turn.id;
  tab.theatrePhase = "done";
  tab.pendingTurnBefore = null;
  tab.highlightsHidden = false; // newly-completed turn always shows highlights
}

/** User dismissed the post-edit status bar. Animate back to normal view. */
export function dismiss(tab: Tab): void {
  if (tab.theatrePhase === "off") return;
  tab.theatrePhase = "resuming";
  clearPhaseTimer(tab.id);
  phaseTimers.set(
    tab.id,
    setTimeout(() => {
      if (tab.theatrePhase === "resuming") tab.theatrePhase = "off";
    }, ZOOM_ANIM_MS),
  );
}

/** User clicked the "show summary" / sidebar toggle. */
export function toggleSidebar(tab: Tab): void {
  tab.sidebarOpen = !tab.sidebarOpen;
}

/** Toggle highlight visibility on the floating chip after resume. */
export function toggleHighlights(tab: Tab): void {
  tab.highlightsHidden = !tab.highlightsHidden;
}

/** Clear all highlights for this tab — accept the changes, reset turns. */
export function clearHighlights(tab: Tab): void {
  tab.turns = [];
  tab.selectedView = "live";
  tab.highlightsHidden = true;
  tab.sidebarOpen = false;
}

/** User dismissed the discoverability tip — don't show again this session. */
export function dismissTip(tab: Tab): void {
  tab.tipDismissed = true;
}

/** Pick which turn the sidebar should show. */
export function selectView(tab: Tab, view: Turn["id"] | "since-open" | "live"): void {
  tab.selectedView = view;
}

/** Used by Theatre.svelte to read the current zoom scale based on phase. */
export function zoomFor(phase: Tab["theatrePhase"]): number {
  switch (phase) {
    case "engaging":
    case "engaged":
    case "done":
      return 0.78;
    default:
      return 1.0;
  }
}

/** Cleanup hook called when a tab closes — drop its timers + ID counter. */
export function disposeTab(tabId: string): void {
  const it = idleTimers.get(tabId);
  if (it) clearTimeout(it);
  idleTimers.delete(tabId);
  clearPhaseTimer(tabId);
  nextTurnIdByTab.delete(tabId);
}

function clearPhaseTimer(tabId: string): void {
  const t = phaseTimers.get(tabId);
  if (t) clearTimeout(t);
  phaseTimers.delete(tabId);
}

/**
 * Helper for components that want to know "is there anything to show?" —
 * either an in-flight turn or a completed-and-not-cleared one.
 */
export function hasActiveTurnOrHighlights(tab: Tab): boolean {
  if (tab.theatrePhase !== "off") return true;
  if (tab.highlightsHidden) return false;
  return tab.turns.length > 0;
}

/**
 * Look up the snapshots being compared given the tab's selectedView.
 * Returns null if nothing to diff (e.g. "live" with no in-flight turn).
 */
export function viewSnapshots(tab: Tab): { before: string; after: string; label: string } | null {
  const view = tab.selectedView;
  if (view === "since-open") {
    return { before: tab.baselineSource, after: tab.source, label: "Since file opened" };
  }
  if (view === "live") {
    if (tab.pendingTurnBefore !== null) {
      return { before: tab.pendingTurnBefore, after: tab.source, label: "This turn (in progress)" };
    }
    // No live turn — fall through to most recent completed turn.
    if (tab.turns.length > 0) {
      const t = tab.turns[0];
      return { before: t.snapshotBefore, after: t.snapshotAfter, label: `v${t.id} — most recent` };
    }
    return null;
  }
  // Specific turn ID
  const t = tab.turns.find((x) => x.id === view);
  if (!t) return null;
  return { before: t.snapshotBefore, after: t.snapshotAfter, label: `v${t.id}` };
}
