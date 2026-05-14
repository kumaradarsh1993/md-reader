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
  import { selectView, toggleSidebar, viewSnapshots } from "./store.svelte";
  import { changedSections, lineDiff, type Section } from "./diff-engine";
  import { summariseDiff, SmartDiffError } from "../llm";

  interface Props { tab: Tab; }
  let { tab }: Props = $props();

  // Map a turn ID to the per-card "mode" choice (naive vs LLM). Stored per
  // turn so flipping a card stays sticky across re-renders.
  let cardMode = $state<Record<string, "naive" | "llm">>({});
  // Per-turn LLM summaries cached client-side. Survives sidebar close/open.
  let llmCache = $state<Record<number, { summary?: string; error?: string; loading?: boolean }>>({});

  // Compute the section list based on current view selection.
  let snapshots = $derived(viewSnapshots(tab));
  let sections = $derived.by((): Section[] => {
    if (!snapshots) return [];
    return changedSections(snapshots.before, snapshots.after);
  });

  // Friendly relative-time formatter for the turn-picker dropdown.
  function ago(ms: number): string {
    const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  }

  async function fetchLlmSummary(turnId: number) {
    const turn = tab.turns.find((t) => t.id === turnId);
    if (!turn) return;
    // Pre-flight: surface a friendlier message than the provider's own
    // "no key set" error if the user hasn't pasted a key for the selected
    // provider yet. summariseDiff would still throw — we just catch it
    // earlier so the loading-spinner doesn't flash.
    const provider = settings.s.llmProvider;
    const keyMissing =
      (provider === "groq" && !settings.s.groqApiKey) ||
      (provider === "anthropic" && !settings.s.anthropicApiKey);
    if (keyMissing) {
      const where = provider === "groq" ? "Groq (console.groq.com)" : "Anthropic";
      llmCache[turnId] = {
        error: `No ${where} API key — add one in Settings → Smart-diff.`,
      };
      return;
    }
    llmCache[turnId] = { loading: true };
    try {
      const res = await summariseDiff(turn.snapshotBefore, turn.snapshotAfter);
      llmCache[turnId] = { summary: res.summary };
    } catch (e) {
      const msg = e instanceof SmartDiffError ? e.message : String(e);
      llmCache[turnId] = { error: msg };
    }
  }

  // For the "since-open" and "live" virtual views we don't cache LLM results
  // (they're moving targets). The card switches to naive-only for those.
  function isVirtualView(view: typeof tab.selectedView): boolean {
    return view === "since-open" || view === "live";
  }
</script>

{#if tab.sidebarOpen}
  <aside class="diff-sidebar" aria-label="Diff sidebar">
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
          <option value={String(t.id)}>v{t.id} — {ago(t.finishedAt)}</option>
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
          {@const cardKey = `${tab.selectedView}:${i}`}
          {@const isTurn = typeof tab.selectedView === "number"}
          {@const mode = cardMode[cardKey] ?? "naive"}
          {@const llm = isTurn ? llmCache[tab.selectedView as number] : undefined}
          <article class="card" class:added={s.changeKind === "added"} class:removed={s.changeKind === "removed"} data-card-section-index={i}>
            <header class="card-head">
              <span class="kind-badge">{s.changeKind}</span>
              <span class="heading" title={s.heading}>
                {#if s.level > 0}
                  <span class="hash">{"#".repeat(s.level)} </span>
                {/if}
                {s.heading}
              </span>
            </header>

            {#if isTurn && !isVirtualView(tab.selectedView)}
              <div class="mode">
                <button
                  class:active={mode === "naive"}
                  onclick={() => (cardMode[cardKey] = "naive")}
                >Naive diff</button>
                <button
                  class:active={mode === "llm"}
                  onclick={() => {
                    cardMode[cardKey] = "llm";
                    if (llm?.summary === undefined && !llm?.loading) {
                      fetchLlmSummary(tab.selectedView as number);
                    }
                  }}
                >✨ Summary</button>
              </div>
            {/if}

            {#if mode === "llm" && isTurn && !isVirtualView(tab.selectedView)}
              {#if llm?.loading}
                <div class="llm-state">Asking {settings.s.llmProvider === "groq" ? "Groq" : "Claude"}…</div>
              {:else if llm?.error}
                <div class="llm-state error">{llm.error}</div>
              {:else if llm?.summary}
                <div class="llm-summary">{@html llm.summary.replace(/\n/g, "<br>")}</div>
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
  @keyframes slide-in {
    from { transform: translateX(20px); opacity: 0; }
    to   { transform: translateX(0); opacity: 1; }
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
