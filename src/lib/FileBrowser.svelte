<script lang="ts">
  import { api, type DirEntry } from "./api";
  import Icon from "./Icon.svelte";
  import { contextMenu, type MenuEntry } from "./context-menu.svelte";
  import { isMac, copyText, revealInFileManager } from "./platform";
  import { refresher } from "./refresh.svelte";
  import { untrack } from "svelte";
  import { invoke } from "@tauri-apps/api/core";

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

  /** The last refresh this component has already served. Plain `let`, not
   *  `$state` — an effect that writes state it also reads is how you kill
   *  every click in the app (see the v0.7 notes on `effect_update_depth`). */
  let servedTick = 0;

  // A refresh has to re-read the folder, not just the open tabs: a new file
  // appearing next to the one you are reading is the most common staleness of
  // all, and the listing is otherwise only read when the directory is opened.
  // Only the tick is a dependency — `currentDir` is read untracked so browsing
  // into a folder doesn't fire a second listing on top of clickEntry's.
  $effect(() => {
    const tick = refresher.tick;
    if (tick === servedTick) return;
    servedTick = tick;
    const dir = untrack(() => currentDir);
    if (dir) load(dir);
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

  /**
   * Does the open file live somewhere inside this folder?
   *
   * The open file's own row is marked, but the moment you stepped up a level
   * that mark vanished and the list gave no clue which of twenty folders you
   * had come out of. Marking the ancestor keeps "you are here" answerable at
   * every level. Deliberately a prefix test on a separator boundary, so
   * `…/docs` never claims `…/docs-old/notes.md`.
   */
  function isOnPathToActive(e: DirEntry): boolean {
    if (!e.is_dir || !activePath) return false;
    const dir = e.path.replace(/[\\/]+$/, "");
    if (activePath.length <= dir.length) return false;
    if (activePath.slice(0, dir.length) !== dir) return false;
    return /^[\\/]/.test(activePath.slice(dir.length));
  }

  function entryMenu(e: DirEntry): MenuEntry[] {
    const openable = e.is_dir || e.is_md;
    return [
      {
        label: e.is_dir ? "Open folder" : "Open",
        icon: e.is_dir ? "folder-open" : "file-text",
        disabled: !openable,
        action: () => clickEntry(e),
      },
      ...(e.is_md
        ? [
            {
              label: "Open in new window",
              icon: "external-link" as const,
              action: async () => {
                try {
                  await invoke("spawn_window", { file: e.path });
                } catch (err) {
                  console.error("spawn_window failed", err);
                }
              },
            },
          ]
        : []),
      { separator: true },
      { label: "Copy name", icon: "copy", action: () => copyText(e.name) },
      { label: "Copy full path", icon: "copy", action: () => copyText(e.path) },
      {
        label: isMac ? "Reveal in Finder" : "Show in folder",
        icon: "folder-open",
        action: () => revealInFileManager(e.path),
      },
    ];
  }

  function browserMenu(): MenuEntry[] {
    return [
      {
        label: "Up to parent folder",
        icon: "arrow-up",
        disabled: !currentDir || !hasParent,
        action: goUp,
      },
      {
        // Routed through the shared refresher rather than a local `load()` so
        // right-clicking here means the same thing as the toolbar button:
        // this folder *and* every open tab come back from disk.
        label: "Refresh",
        icon: "refresh",
        action: () => refresher.run("user"),
      },
      { separator: true },
      {
        label: "Copy folder path",
        icon: "copy",
        disabled: !currentDir,
        action: () => currentDir && copyText(currentDir),
      },
      {
        label: isMac ? "Reveal in Finder" : "Show in folder",
        icon: "folder-open",
        disabled: !currentDir,
        action: () => currentDir && revealInFileManager(currentDir),
      },
    ];
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="file-browser" oncontextmenu={(e) => contextMenu.open(e, browserMenu())}>
  <div class="cwd-bar">
    <button class="up" onclick={goUp} title="Up to parent folder" aria-label="Up to parent folder" disabled={!currentDir || !hasParent}>
      <Icon name="arrow-up" size={13} />
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
            class:on-path={isOnPathToActive(e)}
            aria-current={activePath === e.path ? "true" : undefined}
            title={isOnPathToActive(e) ? `${e.path}\n(contains the open file)` : e.path}
            onclick={() => clickEntry(e)}
            oncontextmenu={(ev) => contextMenu.open(ev, entryMenu(e))}
            disabled={!e.is_dir && !e.is_md}
          >
            <span class="icon">
              {#if e.is_dir}<Icon name="folder" size={13} />
              {:else if e.is_md}<Icon name="file-text" size={13} />
              {:else}<span class="inert-dot" aria-hidden="true"></span>{/if}
            </span>
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
    /* Same typeface as the rest of the app — it inherits the shell's UI stack
       and always has. What made this list read as a different, heavier thing
       was scale, not font: 12.5px at regular weight with roomy rows, sitting
       directly above an outline whose deepest entries are 11px. The two
       sections now share one type ramp. */
    font-size: 12px;
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
    padding: .2rem .4rem;
    border-radius: 5px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 450;
    line-height: 1.4;
    color: var(--muted-strong);
    transition: background-color 90ms ease, color 90ms ease;
  }
  /* Folders carry the structure, so they get the weight; files recede until
     they are the one you have open. Same idea as the outline's depth ramp. */
  .entry.dir { color: var(--fg); font-weight: 500; }
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
  /* The folder the open file lives inside — a quieter echo of `.active`, so
     stepping up a level still answers "which of these did I come out of?".
     Deliberately weaker than the open file itself: this is a trail, not a
     second "you are here". */
  .entry.on-path:not(.active) {
    color: var(--fg-strong);
    font-weight: 550;
  }
  .entry.on-path:not(.active)::before {
    content: "";
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 2px;
    border-radius: 1px;
    background: var(--accent);
    opacity: .45;
  }
  .entry.on-path .icon { color: var(--accent); opacity: 1; }

  /* Non-markdown files are listed for orientation only — visible, clearly
     inert, and never focusable. */
  .entry.dim { color: var(--muted); opacity: .55; cursor: default; }
  .entry[disabled] { cursor: default; }
  .icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    color: var(--muted);
  }
  .entry.dir .icon { color: var(--accent); opacity: .75; }
  .entry.active .icon { color: var(--accent); opacity: 1; }
  .entry.dim .icon { color: var(--border-strong); }
  .inert-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: currentColor;
  }
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
