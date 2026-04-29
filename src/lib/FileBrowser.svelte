<script lang="ts">
  import { onMount } from "svelte";
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

  function shortPath(p: string): string {
    if (!p) return "";
    const parts = p.split(/[\\/]/);
    if (parts.length <= 2) return p;
    return ".../" + parts.slice(-2).join("/");
  }
</script>

<div class="file-browser">
  <div class="cwd-bar">
    <button class="up" onclick={goUp} title="Up to parent" disabled={!currentDir}>↑</button>
    <span class="cwd" title={currentDir ?? ""}>{currentDir ? shortPath(currentDir) : "No folder"}</span>
  </div>

  {#if error}
    <div class="error">{error}</div>
  {:else if !currentDir}
    <div class="empty">Open a file to start browsing its folder.</div>
  {:else if entries.length === 0}
    <div class="empty">Empty folder.</div>
  {:else}
    <ul>
      {#each entries as e}
        <li>
          <button
            class="entry"
            class:dir={e.is_dir}
            class:md={e.is_md}
            class:dim={!e.is_dir && !e.is_md}
            class:active={activePath === e.path}
            onclick={() => clickEntry(e)}
            disabled={!e.is_dir && !e.is_md}
            title={e.path}
          >
            <span class="icon">{e.is_dir ? "▸" : e.is_md ? "📄" : "·"}</span>
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
    gap: .35rem;
    padding: .35rem .5rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .up {
    background: none;
    border: 1px solid var(--border);
    color: var(--fg);
    width: 22px;
    height: 22px;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    font-size: 11px;
  }
  .up:hover:not([disabled]) { background: var(--hover-bg); }
  .up[disabled] { opacity: .3; cursor: default; }
  .cwd {
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1 1 auto;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: .25rem .25rem 1rem;
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .entry {
    display: flex;
    align-items: center;
    gap: .4rem;
    width: 100%;
    background: none;
    border: 0;
    color: var(--fg);
    text-align: left;
    padding: .25rem .35rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12.5px;
    line-height: 1.3;
  }
  .entry:hover:not([disabled]) { background: var(--hover-bg); }
  .entry.active { background: var(--accent-soft); color: var(--fg-strong); }
  .entry.dim { color: var(--muted); cursor: default; }
  .entry[disabled] { cursor: default; }
  .icon {
    flex-shrink: 0;
    width: 1em;
    text-align: center;
    font-size: 11px;
    color: var(--muted);
  }
  .entry.dir .icon { color: var(--accent); }
  .name {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty, .error {
    padding: 1rem .75rem;
    color: var(--muted);
    font-size: 12px;
    font-style: italic;
  }
  .error { color: #c00; font-style: normal; }
</style>
