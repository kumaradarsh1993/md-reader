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
import type { Turn, FreshRange } from "./types";
import { documentChangedRanges } from "./diff-engine";

const RING_CAP = 10;
const IDLE_MS_DEFAULT = 5000;
const ZOOM_ANIM_MS = 380;
/** How long a delta range stays "fresh" (green) before being demoted to
 *  the regular turn-changed (yellow) set. Picked to feel like "the AI was
 *  just typing here" rather than "the AI typed here ages ago". */
const FRESH_TTL_MS = 1500;
/** How often the global decay loop runs while any tab has fresh ranges.
 *  200ms is fine — humans don't notice 200ms latency on a fade. */
const FRESH_DECAY_TICK_MS = 200;

// Monotonic turn IDs scoped per tab. Stored here (not on Tab) because
// it's mechanical bookkeeping that doesn't need reactivity.
const nextTurnIdByTab = new Map<string, number>();

// Per-tab debounce timers, swapped out as new edits arrive.
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Per-tab phase-transition timers (engaging → engaged, resuming → off).
const phaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Tabs that currently have at least one fresh range. The decay loop walks
// this set rather than scanning every open tab on every tick.
const tabsWithFresh = new Map<string, Tab>();
let freshDecayInterval: ReturnType<typeof setInterval> | null = null;

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
    // Start the delta-since-last-edit chain too — first delta in a new turn
    // is computed against the same baseline. After the chain starts,
    // previousSourceForDelta moves forward on every tick.
    tab.previousSourceForDelta = tab.source;
  }
  // If in "done", an incoming edit means the same turn is continuing —
  // we don't move pendingTurnBefore (still points at the original baseline).
  // previousSourceForDelta stays where it is so the next delta is computed
  // against the previous tick's source, not the turn baseline.
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
  // Compute the delta from the previous tick's source to the current source
  // and mark those ranges as "fresh" (green). The decay loop demotes them
  // to "stale" (yellow) after FRESH_TTL_MS of no further touches.
  recordFreshDelta(tab);
  armIdle(tab);
}

/** Diff `previousSourceForDelta → source`, mark the changed AFTER-line
 *  ranges as fresh with the current timestamp, then advance the delta
 *  baseline so the next tick is a true incremental diff. */
function recordFreshDelta(tab: Tab): void {
  const prev = tab.previousSourceForDelta;
  if (prev === null || prev === tab.source) return;
  const deltas = documentChangedRanges(prev, tab.source);
  if (deltas.length === 0) {
    tab.previousSourceForDelta = tab.source;
    return;
  }
  const now = Date.now();
  // Dedup: when an incoming delta exactly matches an existing range, refresh
  // its touchedAt instead of pushing a duplicate. Saves us a few cycles in
  // the decay loop and keeps the array bounded for chatty external editors.
  const next: FreshRange[] = [];
  const seen = new Set<string>();
  for (const r of deltas) {
    const key = `${r.from}-${r.to}`;
    seen.add(key);
    next.push({ from: r.from, to: r.to, touchedAt: now });
  }
  for (const existing of tab.freshRanges) {
    const key = `${existing.from}-${existing.to}`;
    if (seen.has(key)) continue;
    next.push(existing);
  }
  tab.freshRanges = next;
  tab.previousSourceForDelta = tab.source;
  ensureFreshDecayLoop(tab);
}

/** Start the global decay tick if it isn't already running, and register
 *  this tab as having fresh ranges so the loop will visit it. */
function ensureFreshDecayLoop(tab: Tab): void {
  tabsWithFresh.set(tab.id, tab);
  if (freshDecayInterval) return;
  freshDecayInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, t] of tabsWithFresh) {
      if (t.freshRanges.length === 0) {
        tabsWithFresh.delete(id);
        continue;
      }
      const surviving = t.freshRanges.filter((r) => now - r.touchedAt < FRESH_TTL_MS);
      if (surviving.length !== t.freshRanges.length) {
        t.freshRanges = surviving;
      }
      if (surviving.length === 0) {
        tabsWithFresh.delete(id);
      }
    }
    if (tabsWithFresh.size === 0 && freshDecayInterval) {
      clearInterval(freshDecayInterval);
      freshDecayInterval = null;
    }
  }, FRESH_DECAY_TICK_MS);
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
  // Drop everything in fresh — the turn is done, so anything still fresh
  // should now appear yellow alongside the rest of the turn's edits.
  if (tab.freshRanges.length > 0) {
    tab.freshRanges = [];
    tabsWithFresh.delete(tab.id);
  }
  tab.previousSourceForDelta = null;
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
  tab.freshRanges = [];
  tabsWithFresh.delete(tab.id);
  tab.previousSourceForDelta = null;
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

/** Cleanup hook called when a tab closes — drop its timers + ID counter. */
export function disposeTab(tabId: string): void {
  const it = idleTimers.get(tabId);
  if (it) clearTimeout(it);
  idleTimers.delete(tabId);
  clearPhaseTimer(tabId);
  nextTurnIdByTab.delete(tabId);
  tabsWithFresh.delete(tabId);
  if (tabsWithFresh.size === 0 && freshDecayInterval) {
    clearInterval(freshDecayInterval);
    freshDecayInterval = null;
  }
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
