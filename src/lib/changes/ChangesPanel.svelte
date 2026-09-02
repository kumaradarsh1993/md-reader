<script lang="ts">
  /**
   * The inbox: every file touched since it was last read, grouped by when.
   *
   * This is the part that answers the actual complaint — *"it made targeted
   * edits to file three and five and I would not know it was file five."* Margin
   * bars are useless for that, because they require already being in the right
   * file. This is the surface you open having been away.
   *
   * Grouping is by working session rather than by file, because the question is
   * chronological: what happened, in what order, over what stretch of time. A
   * file-first list buries the fact that six edits across four files were one
   * ten-minute burst on Sunday evening.
   */
  import Icon from "../Icon.svelte";
  import { changes } from "./store.svelte";
  import { groupIntoSessions, sessionLabel, offsetLabel, relativeTime } from "./time";
  import { describeRegions } from "./regions";
  import { splitPath } from "./sidecar";
  import type { ChangeEntry } from "./store.svelte";

  interface Props {
    onOpenChange: (path: string, revisionId: number) => void;
    onClose: () => void;
  }
  let { onOpenChange, onClose }: Props = $props();

  /** Unreviewed first; if there is nothing unread, show recent history rather
   *  than an empty panel — "nothing changed" and "you have read everything"
   *  are different answers and both deserve their content. */
  let entries = $derived.by((): ChangeEntry[] => {
    void changes.tick;
    const unread = changes.inbox;
    if (unread.length > 0) return unread;
    const all: ChangeEntry[] = [];
    for (const f of Object.values(changes.files)) {
      const name = splitPath(f.path)?.name ?? f.path;
      for (const r of f.revisions) all.push({ path: f.path, name, revision: r });
    }
    return all.sort((a, b) => b.revision.at - a.revision.at).slice(0, 40);
  });

  let sessions = $derived(groupIntoSessions(entries, (e) => e.revision.at));
  let unreadCount = $derived(changes.totalUnreviewed);
</script>

<aside class="changes" aria-label="Changes">
  <header>
    <div class="title">
      <span>Changes</span>
      {#if unreadCount > 0}<span class="pill">{unreadCount}</span>{/if}
    </div>
    <div class="tools">
      <button
        class="tool"
        onclick={() => changes.scan("user")}
        disabled={changes.scanning}
        title="Check for changes now"
        aria-label="Check for changes now"
      >
        <Icon name="refresh" size={14} />
      </button>
      {#if unreadCount > 0}
        <button class="tool text" onclick={() => changes.markAllReviewed()} title="Mark everything reviewed">
          Mark all read
        </button>
      {/if}
      <button class="tool" onclick={onClose} title="Close" aria-label="Close">
        <Icon name="x" size={15} />
      </button>
    </div>
  </header>

  <div class="scroll">
    {#if entries.length === 0}
      <p class="empty">
        Nothing has changed in the files you have open since you last read them.
        <span class="dim">Fox MD checks whenever this window comes back into focus.</span>
      </p>
    {:else}
      {#each sessions as session (session.from)}
        <section class="session">
          <!-- The heading carries the day and the span of hours; the rows carry
               the offsets within it. That split is what lets "Sunday, 8–10 pm"
               and "+2 min" both be true and both be useful. -->
          <h3>{sessionLabel(session.from, session.to)}</h3>
          {#each session.items as entry, i (entry.path + entry.revision.id)}
            {@const prev = session.items[i + 1]}
            <button
              class="row"
              class:unread={!entry.revision.reviewed}
              onclick={() => onOpenChange(entry.path, entry.revision.id)}
              title={entry.path}
            >
              <span class="dot" aria-hidden="true"></span>
              <span class="row-main">
                <span class="name">{entry.name}</span>
                <span class="what">
                  {#if entry.revision.isNew}
                    new file
                  {:else if entry.revision.truncated}
                    changed — too large to show
                  {:else}
                    {describeRegions(entry.revision.regions)}
                  {/if}
                </span>
              </span>
              <span class="at">
                {#if prev}{offsetLabel(prev.revision.at, entry.revision.at)}{:else}{relativeTime(entry.revision.at)}{/if}
              </span>
            </button>
          {/each}
        </section>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .changes {
    display: flex;
    flex-direction: column;
    width: clamp(280px, 26vw, 380px);
    flex-shrink: 0;
    border-left: 1px solid var(--chrome-border);
    background: var(--chrome-bg);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: .5rem;
    padding: .55rem .5rem .55rem .75rem;
    border-bottom: 1px solid var(--chrome-border);
    flex-shrink: 0;
  }
  .title {
    display: flex;
    align-items: center;
    gap: .4rem;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--fg-strong);
  }
  .pill {
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1;
    padding: .2rem .35rem;
    border-radius: 999px;
    background: var(--accent);
    color: white;
  }
  .tools { margin-left: auto; display: flex; align-items: center; gap: .15rem; }
  .tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    min-width: 24px;
    padding: 0 .3rem;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
  }
  .tool:hover:not(:disabled) { background: var(--chrome-hover); color: var(--fg-strong); }
  .tool:disabled { opacity: .45; cursor: default; }

  .scroll { overflow-y: auto; padding: .4rem .35rem 1rem; }
  .empty {
    margin: 1.6rem .75rem;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    gap: .5rem;
  }
  .dim { opacity: .75; font-size: 11.5px; }

  .session { margin-bottom: .9rem; }
  h3 {
    margin: .35rem .4rem .3rem;
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--muted);
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: .5rem;
    width: 100%;
    padding: .4rem .4rem .45rem;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--fg);
    text-align: left;
    cursor: pointer;
    font-family: inherit;
  }
  .row:hover { background: var(--chrome-hover); }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

  /* The unread marker is the dot, not bold text: a list where half the rows are
     bold is harder to scan than one where a 5px dot does the work. */
  .dot {
    width: 5px;
    height: 5px;
    margin-top: .45em;
    border-radius: 50%;
    background: transparent;
    flex-shrink: 0;
  }
  .row.unread .dot { background: var(--accent); }

  .row-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto; }
  .name {
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row.unread .name { font-weight: 600; color: var(--fg-strong); }
  .what { font-size: 11px; color: var(--muted); }
  .at {
    font-size: 10.5px;
    color: var(--muted);
    white-space: nowrap;
    margin-top: .15em;
  }
</style>
