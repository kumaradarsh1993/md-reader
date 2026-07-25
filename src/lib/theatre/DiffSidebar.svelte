<script lang="ts">
  /**
   * Diff sidebar — right-side panel showing what changed in the selected
   * "view" (a specific turn, the live in-flight turn, or "since file opened").
   *
   * Layout: header with view-picker dropdown, scrollable body of section
   * cards. Each card has a Naive ↔ LLM summary toggle and shows either:
   *   - red/green inline diff (via diff-engine.lineDiff)
   *   - prose LLM summary fetched lazily (reuses smart-diff backend)
   */
  import { settings } from "../settings-store.svelte";
  import type { Tab } from "../tabs-store.svelte";
  import type { Turn } from "./types";
  import { selectView, toggleSidebar, viewSnapshots } from "./store.svelte";
  import { changedSections, countLines, lineDiff, type Section } from "./diff-engine";
  import { summariseDiff, SmartDiffError } from "../llm";
  import { viewNav } from "../view-nav.svelte";

  interface Props { tab: Tab; }
  let { tab }: Props = $props();

  let asideEl: HTMLElement | null = $state(null);

  // Compute the section list based on current view selection.
  let snapshots = $derived(viewSnapshots(tab));
  let sections = $derived.by((): Section[] => {
    if (!snapshots) return [];
    return changedSections(snapshots.before, snapshots.after);
  });

  // The Turn object backing the current view, when the view is a specific
  // completed turn (not the moving-target "since-open" / "live" views). Both
  // the per-card LLM cache and the per-card mode choice live directly on this
  // object (see types.ts: Turn.cardSummaries / Turn.cardMode) so they survive
  // the sidebar unmounting — this component only exists in the DOM while
  // tab.sidebarOpen is true, so any state kept in local $state here is lost
  // (and, for LLM summaries, silently re-fetched/re-billed) every time the
  // user closes and reopens the panel.
  let activeTurn = $derived.by((): Turn | undefined => {
    if (typeof tab.selectedView !== "number") return undefined;
    return tab.turns.find((t) => t.id === tab.selectedView);
  });

  function cardMode(i: number): "naive" | "llm" {
    return activeTurn?.cardMode?.[i] ?? "naive";
  }
  function setCardMode(i: number, mode: "naive" | "llm") {
    if (!activeTurn) return;
    if (!activeTurn.cardMode) activeTurn.cardMode = {};
    activeTurn.cardMode[i] = mode;
  }

  // Friendly relative-time formatter for the turn-picker dropdown.
  function ago(ms: number): string {
    const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  }

  // How long the turn actually took to write (startedAt → finishedAt) —
  // cheap to compute and gives the picker more signal than "how long ago"
  // alone (a 3-second nudge reads very differently from a 4-minute rewrite).
  function duration(t: Turn): string {
    const ms = Math.max(0, t.finishedAt - t.startedAt);
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  }

  // Caption under each card heading — "N lines changed/added/removed".
  // `changedLineRangesAfter` is already correct for "added" (whole section)
  // and "changed" (just the differing sub-ranges); "removed" sections carry
  // no AFTER content at all, so fall back to counting the BEFORE text.
  function lineCountLabel(s: Section): string {
    const n = s.changeKind === "removed"
      ? countLines(s.beforeText)
      : s.changedLineRangesAfter.reduce((sum, r) => sum + (r.to - r.from + 1), 0);
    if (n <= 0) return s.changeKind;
    const noun = n === 1 ? "line" : "lines";
    const verb = s.changeKind === "added" ? "added" : s.changeKind === "removed" ? "removed" : "changed";
    return `${n} ${noun} ${verb}`;
  }

  async function fetchLlmSummary(i: number, section: Section) {
    const turn = activeTurn;
    if (!turn) return;
    // Pre-flight: surface a friendlier message than the provider's own
    // "no key set" error if the user hasn't pasted a key for the selected
    // provider yet. summariseDiff would still throw — we just catch it
    // earlier so the loading-spinner doesn't flash.
    const provider = settings.s.llmProvider;
    const keyMissing =
      (provider === "groq" && !settings.s.groqApiKey) ||
      (provider === "anthropic" && !settings.s.anthropicApiKey);
    if (!turn.cardSummaries) turn.cardSummaries = {};
    if (keyMissing) {
      const where = provider === "groq" ? "Groq (console.groq.com)" : "Anthropic";
      turn.cardSummaries[i] = {
        error: `No ${where} API key — add one in Settings → Smart-diff.`,
      };
      return;
    }
    turn.cardSummaries[i] = { loading: true };
    try {
      // Summarise just THIS section's before/after — not the whole turn.
      // (The previous implementation always sent turn.snapshotBefore /
      // snapshotAfter here, so every card in a turn showed the identical
      // whole-document summary the moment any one of them was toggled to
      // "Summary" — the opposite of the design doc's stated goal: "quickly
      // LLM-summarise the one paragraph you care about without burning
      // tokens on the whole document.")
      const res = await summariseDiff(section.beforeText, section.afterText);
      turn.cardSummaries[i] = { summary: res.summary };
    } catch (e) {
      const msg = e instanceof SmartDiffError ? e.message : String(e);
      turn.cardSummaries[i] = { error: msg };
    }
  }

  /** Scroll the viewer to this section. No-op for removed sections — they
   *  no longer exist in the current document, so there's nowhere to jump. */
  function jumpToSection(section: Section) {
    if (section.startLineAfter <= 0) return;
    viewNav.jumpToLine(section.startLineAfter);
  }

  // Focus the panel on open so keyboard users land somewhere sensible
  // without having to tab in from the toolbar, and so Escape (below) has an
  // obvious target. tabindex=-1 on the <aside> makes it focusable without
  // adding it to the normal tab order.
  $effect(() => {
    asideEl?.focus();
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      toggleSidebar(tab);
    }
  }
</script>

{#if tab.sidebarOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <aside
    class="diff-sidebar"
    aria-label="Diff sidebar"
    tabindex="-1"
    bind:this={asideEl}
    onkeydown={onKeydown}
  >
    <header>
      <h3>Changes</h3>
      <button class="close" onclick={() => toggleSidebar(tab)} aria-label="Close sidebar">✕</button>
    </header>

    <label class="picker">
      <span>Show changes from:</span>
      <select
        value={String(tab.selectedView)}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          if (v === "live" || v === "since-open") selectView(tab, v);
          else selectView(tab, Number(v));
        }}
      >
        {#if tab.pendingTurnBefore !== null}
          <option value="live">This turn (in progress)</option>
        {/if}
        {#each tab.turns as t}
          <option value={String(t.id)}>v{t.id} — {ago(t.finishedAt)} · {duration(t)}</option>
        {/each}
        <option value="since-open">Since file opened</option>
      </select>
    </label>

    <div class="body">
      {#if !snapshots}
        <p class="empty">No turn selected. Wait for an AI edit, or pick "Since file opened" above.</p>
      {:else if sections.length === 0}
        <p class="empty">No changes in this view — snapshots are identical.</p>
      {:else}
        {#each sections as s, i (s.heading + ":" + i)}
          {@const mode = cardMode(i)}
          {@const summaryState = activeTurn?.cardSummaries?.[i]}
          {@const navigable = s.startLineAfter > 0}
          <article class="card" class:added={s.changeKind === "added"} class:removed={s.changeKind === "removed"} data-card-section-index={i}>
            <header class="card-head">
              <span class="kind-badge">{s.changeKind}</span>
              {#if navigable}
                <button
                  type="button"
                  class="heading-link"
                  onclick={() => jumpToSection(s)}
                  title={`Jump to "${s.heading}" in the document`}
                >
                  {#if s.level > 0}<span class="hash">{"#".repeat(s.level)} </span>{/if}
                  <span class="heading-text">{s.heading}</span>
                </button>
              {:else}
                <span class="heading no-jump" title="This section no longer exists in the document">
                  {#if s.level > 0}<span class="hash">{"#".repeat(s.level)} </span>{/if}
                  {s.heading}
                </span>
              {/if}
            </header>
            <p class="count">{lineCountLabel(s)}</p>

            {#if activeTurn}
              <div class="mode">
                <button
                  class:active={mode === "naive"}
                  onclick={() => setCardMode(i, "naive")}
                >Naive diff</button>
                <button
                  class:active={mode === "llm"}
                  onclick={() => {
                    setCardMode(i, "llm");
                    if (summaryState?.summary === undefined && !summaryState?.loading) {
                      fetchLlmSummary(i, s);
                    }
                  }}
                >✨ Summary</button>
              </div>
            {/if}

            {#if mode === "llm" && activeTurn}
              {#if summaryState?.loading}
                <div class="llm-state">Asking {settings.s.llmProvider === "groq" ? "Groq" : "Claude"}…</div>
              {:else if summaryState?.error}
                <div class="llm-state error">{summaryState.error}</div>
              {:else if summaryState?.summary}
                <div class="llm-summary">{@html summaryState.summary.replace(/\n/g, "<br>")}</div>
              {:else}
                <div class="llm-state">Click ✨ Summary to fetch.</div>
              {/if}
            {:else}
              <pre class="naive">{#each lineDiff(s.beforeText, s.afterText) as op}{#if op.kind === "equal"}<span class="eq">{op.text}</span>{:else if op.kind === "insert"}<span class="ins">{op.text}</span>{:else}<span class="del">{op.text}</span>{/if}{/each}</pre>
            {/if}
          </article>
        {/each}
      {/if}
    </div>
  </aside>
{/if}

<style>
  .diff-sidebar {
    width: 360px;
    flex: 0 0 360px;
    background: var(--bg-elevated);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slide-in .25s ease both;
  }
  .diff-sidebar:focus {
    outline: none;
  }
  @keyframes slide-in {
    from { transform: translateX(20px); opacity: 0; }
    to   { transform: translateX(0); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .diff-sidebar { animation: none; }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .65rem .85rem .55rem;
    border-bottom: 1px solid var(--border);
  }
  header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.005em;
  }
  .close {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: .15rem .4rem;
    border-radius: 4px;
    font-size: 13px;
    line-height: 1;
    height: auto;
  }
  .close:hover { color: var(--fg); background: var(--hover-bg); }
  .picker {
    display: flex;
    flex-direction: column;
    gap: .25rem;
    padding: .55rem .85rem;
    font-size: 11.5px;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  .picker select {
    padding: .3rem .45rem;
    background: var(--input-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
    font-size: 12.5px;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: .65rem .55rem 2rem;
  }
  .empty {
    color: var(--muted);
    font-size: 12.5px;
    padding: 1rem .35rem;
    text-align: center;
  }
  .card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: .6rem .65rem;
    margin-bottom: .55rem;
  }
  .card.added { border-left: 3px solid #3fb950; }
  .card.removed { border-left: 3px solid #f85149; opacity: .85; }
  .card-head {
    display: flex;
    align-items: center;
    gap: .5rem;
    margin-bottom: .4rem;
  }
  .kind-badge {
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--muted-bg);
    color: var(--muted-strong);
    flex-shrink: 0;
  }
  .card.added .kind-badge { background: rgba(63, 185, 80, .12); color: #3fb950; }
  .card.removed .kind-badge { background: rgba(248, 81, 73, .12); color: #f85149; }
  .heading {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .heading.no-jump {
    color: var(--muted);
    cursor: not-allowed;
  }
  /* Clickable heading — navigates the viewer to this section. Styled to
     look like the plain heading it replaces, with just enough affordance
     (pointer cursor, underline-on-hover, focus ring) to read as clickable. */
  .heading-link {
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--fg);
    background: transparent;
    border: 0;
    padding: 0;
    margin: 0;
    height: auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    text-align: left;
    cursor: pointer;
    border-radius: 3px;
  }
  .heading-link:hover .heading-text,
  .heading-link:focus-visible .heading-text {
    text-decoration: underline;
  }
  .heading-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .count {
    margin: -.2rem 0 .4rem;
    font-size: 11px;
    color: var(--muted);
  }
  .hash { color: var(--muted); font-family: ui-monospace, Menlo, Consolas, monospace; }
  .mode {
    display: inline-flex;
    background: var(--muted-bg);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
    margin-bottom: .5rem;
  }
  .mode button {
    border: 0;
    background: transparent;
    color: var(--muted-strong);
    padding: .15rem .55rem;
    font-size: 11px;
    border-radius: 4px;
    cursor: pointer;
    height: auto;
    font: inherit;
    font-weight: 500;
  }
  .mode button:hover { color: var(--fg); }
  .mode button.active {
    background: var(--bg);
    color: var(--fg-strong);
    box-shadow: var(--shadow-sm);
  }
  .naive {
    margin: 0;
    padding: .5rem .55rem;
    background: var(--code-bg);
    border-radius: 5px;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.55;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .naive .eq { color: var(--muted); }
  .naive .ins { background: rgba(63, 185, 80, .18); color: var(--fg); text-decoration: none; }
  .naive .del { background: rgba(248, 81, 73, .18); color: var(--muted); text-decoration: line-through; }
  .llm-summary {
    font-size: 12.5px;
    line-height: 1.55;
    padding: .25rem .15rem;
    color: var(--fg);
  }
  .llm-state {
    font-size: 12px;
    color: var(--muted);
    padding: .25rem .15rem;
  }
  .llm-state.error { color: #f85149; }
</style>
