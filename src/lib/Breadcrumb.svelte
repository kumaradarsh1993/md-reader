<script lang="ts">
  import Icon from "./Icon.svelte";

  /**
   * The document's location, shown the way a file manager shows it.
   *
   * Up to v0.6 the toolbar printed the raw path — `D:\Copilot Cowork Backup
   * TD\Tasks\preparing-...\01 - Filings\AY2026-27 (FY2025-26)\Computation and
   * Reconciliation.md`. That is a string a developer reads and a normal person
   * skips: the one part that matters (the file name) is buried at the end,
   * the separators are noise, and the whole thing is set in the same grey as
   * everything else so nothing is emphasised.
   *
   * Explorer, Finder and Notion all solved this the same way: drop the
   * separators to a light glyph, mute the ancestry, weight the leaf, and elide
   * from the *left* — because the folders nearest the file are the ones that
   * carry meaning, and the drive letter never does.
   */
  interface Props {
    path: string;
    /** Unsaved-changes marker, rendered inside the crumb trail. */
    dirty?: boolean;
    /** How many ancestor folders to keep before eliding. */
    maxCrumbs?: number;
    onContextMenu?: (e: MouseEvent) => void;
  }
  let { path, dirty = false, maxCrumbs = 2, onContextMenu }: Props = $props();

  let parts = $derived(path.split(/[\\/]/).filter(Boolean));
  let fileName = $derived(parts.length ? parts[parts.length - 1] : path);
  /** Everything above the file, nearest-first order preserved. */
  let dirs = $derived(parts.slice(0, -1));
  let shown = $derived(dirs.slice(-maxCrumbs));
  let elided = $derived(dirs.length > maxCrumbs);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="crumbs" title={path} oncontextmenu={onContextMenu}>
  {#if elided}
    <span class="crumb ellipsis" title={dirs.join(" › ")}>…</span>
    <span class="sep" aria-hidden="true"><Icon name="chevron-right" size={11} /></span>
  {/if}
  {#each shown as d (d)}
    <span class="crumb dir">{d}</span>
    <span class="sep" aria-hidden="true"><Icon name="chevron-right" size={11} /></span>
  {/each}
  <span class="crumb leaf">{fileName}</span>
  {#if dirty}
    <span class="dirty" title="Unsaved changes" aria-label="Unsaved changes"></span>
  {/if}
</div>

<style>
  .crumbs {
    display: flex;
    align-items: center;
    gap: 1px;
    min-width: 0;
    max-width: 100%;
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
    /* The trail is a label, not a control — but it is the drag handle for the
       window, so it must not swallow the pointer. */
    cursor: default;
  }
  .crumb {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 2px;
  }
  /* Ancestors give way first, and never below a legible stub. The leaf keeps
     its space: a truncated *folder* is still orientation, a truncated file
     name is a failure to answer "what am I reading?". */
  .crumb.dir {
    color: var(--chrome-fg);
    opacity: .72;
    flex: 0 1 auto;
    min-width: 2.5em;
  }
  .crumb.ellipsis {
    color: var(--chrome-fg);
    opacity: .5;
    flex: 0 0 auto;
    letter-spacing: .05em;
  }
  .crumb.leaf {
    color: var(--fg);
    font-weight: 550;
    flex: 0 1 auto;
    min-width: 4em;
  }
  .sep {
    display: flex;
    align-items: center;
    color: var(--chrome-fg);
    opacity: .38;
    flex-shrink: 0;
  }
  .dirty {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
    margin-left: .4rem;
  }
</style>
