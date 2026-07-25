<script lang="ts">
  import { api, type DirEntry } from "./api";

  interface Props {
    cwd: string | null;
    activePath: string | null;
    onOpen: (path: string) => void;
  }
  let { cwd, activePath, onOpen }: Props = $props();

  let entries = $state<DirEntry[]>([]);
  let currentDir = $state<string | null>(null);
  let error = $state<string | null>(null);
  /** Null until we've asked the backend; false once we know we're at a root. */
  let hasParent = $state(true);

  // Re-list whenever cwd changes (e.g. user opened a file in a different dir).
  $effect(() => {
    const target = cwd;
    if (target) {
      currentDir = target;
      load(target);
    }
  });

  async function load(dir: string) {
    error = null;
    try {
      entries = await api.listDir(dir);
    } catch (e) {
      error = String(e);
      entries = [];
    }
    // Resolve the up-control's enabled state from the backend rather than
    // guessing from the path string, which gets separator/UNC rules wrong.
    try {
      const parent = await api.parentOf(dir);
      hasParent = !!parent && parent !== dir;
    } catch {
      hasParent = false;
    }
  }

  async function goUp() {
    if (!currentDir) return;
    const parent = await api.parentOf(currentDir);
    if (parent && parent !== currentDir) {
      currentDir = parent;
      await load(parent);
    }
  }

  function clickEntry(e: DirEntry) {
    if (e.is_dir) {
      currentDir = e.path;
      load(e.path);
    } else if (e.is_md) {
      onOpen(e.path);
    }
  }

  /** Leaf folder name — the crumb the user actually reads. */
  let leafName = $derived(
    currentDir ? (currentDir.split(/[\\/]/).filter(Boolean).pop() ?? currentDir) : "",
  );
  /** One level of ancestry for context, kept short so it never wraps. */
  let parentName = $derived.by(() => {
    if (!currentDir) return "";
    const parts = currentDir.split(/[\\/]/).filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 2] : "";
  });
</script>

<div class="file-browser">
  <div class="cwd-bar">
    <button class="up" onclick={goUp} title="Up to parent folder" disabled={!currentDir || !hasParent}>
      ↑
    </button>
    <span class="crumbs" title={currentDir ?? ""}>
      {#if currentDir}
        {#if parentName}<span class="crumb-parent">{parentName}</span><span class="sep">/</span>{/if}
        <span class="crumb-leaf">{leafName}</span>
      {:else}
        <span class="crumb-leaf muted">No folder</span>
      {/if}
    </span>
  </div>

  {#if error}
    <div class="error">{error}</div>
  {:else if !currentDir}
    <div class="empty">Open a file to start browsing</div>
  {:else if entries.length === 0}
    <div class="empty">Empty folder</div>
  {:else}
    <ul>
      {#each entries as e (e.path)}
        <li>
          <button
            class="entry"
            class:dir={e.is_dir}
            class:md={e.is_md}
            class:dim={!e.is_dir && !e.is_md}
            class:active={activePath === e.path}
            aria-current={activePath === e.path ? "true" : undefined}
            onclick={() => clickEntry(e)}
            disabled={!e.is_dir && !e.is_md}
            title={e.path}
          >
            <span class="icon" aria-hidden="true">{e.is_dir ? "📁" : e.is_md ? "📄" : "·"}</span>
            <span class="name">{e.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .file-browser {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    font-size: 12.5px;
  }
  .cwd-bar {
    display: flex;
    align-items: center;
    gap: .4rem;
    padding: .3rem .5rem .35rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .up {
    background: none;
    border: 1px solid var(--border);
    color: var(--muted-strong);
    width: 20px;
    height: 20px;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    font-size: 11px;
    line-height: 1;
    flex-shrink: 0;
    transition: background-color 90ms ease, color 90ms ease;
  }
  .up:hover:not([disabled]) { background: var(--hover-bg); color: var(--fg-strong); }
  .up[disabled] { opacity: .35; cursor: default; }
  .crumbs {
    display: flex;
    align-items: baseline;
    gap: .15rem;
    font-size: 11px;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    white-space: nowrap;
  }
  /* The ancestor crumb is allowed to shrink away entirely; the leaf folder is
     the part that has to stay readable. */
  .crumb-parent { color: var(--muted); overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; }
  .sep { color: var(--border-strong); flex-shrink: 0; }
  .crumb-leaf {
    color: var(--muted-strong);
    font-weight: 550;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1 1 auto;
  }
  .crumb-leaf.muted { color: var(--muted); font-weight: 400; font-style: italic; }

  ul {
    list-style: none;
    margin: 0;
    padding: .25rem .3rem 1rem;
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .entry {
    position: relative;
    display: flex;
    align-items: center;
    gap: .4rem;
    width: 100%;
    background: none;
    border: 0;
    color: var(--fg);
    text-align: left;
    padding: .25rem .4rem;
    border-radius: 5px;
    cursor: pointer;
    font-size: 12.5px;
    line-height: 1.35;
    transition: background-color 90ms ease;
  }
  .entry:hover:not([disabled]) { background: var(--hover-bg); }
  .entry:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .entry.active {
    background: var(--accent-soft);
    color: var(--fg-strong);
    font-weight: 550;
  }
  /* Left accent tick on the open file — matches the outline's active bar so the
     two sections agree on what "you are here" looks like. */
  .entry.active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 3px;
    bottom: 3px;
    width: 2px;
    border-radius: 1px;
    background: var(--accent);
  }
  /* Non-markdown files are listed for orientation only — visible, clearly
     inert, and never focusable. */
  .entry.dim { color: var(--muted); opacity: .55; cursor: default; }
  .entry[disabled] { cursor: default; }
  .icon {
    flex-shrink: 0;
    width: 1.15em;
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    line-height: 1;
  }
  .entry.dim .icon { color: var(--border-strong); }
  .name {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty, .error {
    padding: 1rem .75rem;
    color: var(--muted);
    font-size: 11.5px;
    font-style: italic;
  }
  .error { color: #e5484d; font-style: normal; }

  @media (prefers-reduced-motion: reduce) {
    .up, .entry { transition: none; }
  }
</style>
