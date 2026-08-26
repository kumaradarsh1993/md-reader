<script lang="ts">
  /**
   * One thread in the margin — collapsed to a marker, or expanded to a card.
   *
   * ## Sizing
   *
   * The card has **no fixed height and no scroll of its own**. Most notes are a
   * line or two; some are three paragraphs, and a three-paragraph note squeezed
   * into a 120px box with an inner scrollbar is worse than useless — you cannot
   * read it, and you cannot see that there is more. The card grows to its
   * content and the lane's stacking pushes its neighbours down (see
   * CommentLane), so a long note costs vertical space in a column that has it
   * rather than legibility.
   *
   * The composer grows the same way, up to twelve lines, then scrolls: past
   * that you are writing a document, not a margin note, and an input taller
   * than the viewport can hide its own Save button.
   */
  import Icon from "../Icon.svelte";
  import { HIGHLIGHT_COLORS, threadCount, type Annotation, type CommentNode, type HighlightColor } from "./types";

  interface Props {
    ann: Annotation;
    expanded: boolean;
    /** Rendered as detached: the text it pointed at is no longer in the file. */
    detached?: boolean;
    author: string;
    onToggle: () => void;
    onReply: (parentId: string | null, body: string) => void;
    onEdit: (noteId: string, body: string) => void;
    onDeleteNote: (noteId: string) => void;
    onDelete: () => void;
    /** `null` clears the fill — a comment does not have to be highlighted. */
    onColor: (color: HighlightColor | null) => void;
    onToggleResolved: () => void;
    /** Scroll the document to this annotation's text. */
    onGoTo: () => void;
  }
  let {
    ann, expanded, detached = false, author,
    onToggle, onReply, onEdit, onDeleteNote, onDelete, onColor, onToggleResolved, onGoTo,
  }: Props = $props();

  let draft = $state("");
  let replyTo = $state<string | null>(null);
  let editing = $state<string | null>(null);
  let editDraft = $state("");
  let colorOpen = $state(false);
  let composer: HTMLTextAreaElement | undefined = $state();

  let count = $derived(threadCount(ann));

  /** Flatten for rendering: the thread is a tree, the card is a column. Depth
   *  becomes an indent, which is the only thing nesting has to communicate. */
  let flat = $derived.by(() => {
    const out: Array<{ node: CommentNode; depth: number }> = [];
    const walk = (nodes: CommentNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ node: n, depth });
        walk(n.replies, depth + 1);
      }
    };
    walk(ann.thread, 0);
    return out;
  });

  function grow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    // 12 lines ~= 232px at this font size. Past that it scrolls.
    el.style.height = `${Math.min(232, el.scrollHeight)}px`;
  }

  function autoGrow(node: HTMLTextAreaElement) {
    grow(node);
    const on = () => grow(node);
    node.addEventListener("input", on);
    return { destroy: () => node.removeEventListener("input", on) };
  }

  function submit() {
    const body = draft.trim();
    if (!body) return;
    onReply(replyTo, body);
    draft = "";
    replyTo = null;
  }

  function submitEdit() {
    if (!editing) return;
    onEdit(editing, editDraft);
    editing = null;
    editDraft = "";
  }

  function onComposerKey(e: KeyboardEvent) {
    // Enter is a newline — these are prose notes, not chat messages, and losing
    // a half-written paragraph to a stray Enter is unforgivable in a box whose
    // whole purpose is holding a paragraph. Ctrl/Cmd+Enter posts.
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      if (draft.trim()) { draft = ""; replyTo = null; }
      else onToggle();
    }
  }

  function when(ms: number): string {
    const d = new Date(ms);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  }

  $effect(() => {
    if (expanded && composer && ann.thread.length === 0) composer.focus();
  });
</script>

{#if !expanded}
  <!-- Collapsed: the marker. Wide enough to be an easy target, quiet enough to
       scroll past. The count is the only information worth showing here. -->
  <button
    class="marker {ann.color ?? 'none'}"
    class:resolved={ann.resolved}
    class:detached
    onclick={onToggle}
    title={detached
      ? "This note's text is no longer in the document"
      : `${count} note${count === 1 ? "" : "s"} — click to open`}
    aria-expanded="false"
  >
    <Icon name="message-square" size={12} />
    {#if count > 1}<span class="n">{count}</span>{/if}
  </button>
{:else}
  <div class="card {ann.color ?? 'none'}" class:resolved={ann.resolved} class:detached>
    <div class="card-head">
      <button class="quote" onclick={onGoTo} title="Go to this passage">
        <span class="quote-bar"></span>
        <span class="quote-text">{ann.anchor.quote}</span>
      </button>
      <div class="head-actions">
        <div class="color-wrap">
          <button
            class="mini"
            onclick={() => (colorOpen = !colorOpen)}
            title="Change colour"
            aria-label="Change colour"
          ><span class="dot {ann.color ?? 'none'}"></span></button>
          {#if colorOpen}
            <div class="color-pop">
              {#each HIGHLIGHT_COLORS as c (c)}
                <button
                  class="dot {c}"
                  class:on={ann.color === c}
                  onclick={() => { onColor(c); colorOpen = false; }}
                  aria-label="Colour {c}"
                  title={c}
                ></button>
              {/each}
              <!-- A comment starts unhighlighted and can go back to it. -->
              <button
                class="dot none"
                class:on={ann.color === null}
                onclick={() => { onColor(null); colorOpen = false; }}
                aria-label="No highlight"
                title="No highlight"
              ></button>
            </div>
          {/if}
        </div>
        <button
          class="mini"
          class:on={ann.resolved}
          onclick={onToggleResolved}
          title={ann.resolved ? "Reopen" : "Mark resolved"}
          aria-label={ann.resolved ? "Reopen" : "Mark resolved"}
        ><Icon name="check" size={13} /></button>
        <button class="mini" onclick={onDelete} title="Delete this thread and its highlight" aria-label="Delete">
          <Icon name="trash" size={13} />
        </button>
        <button class="mini" onclick={onToggle} title="Collapse" aria-label="Collapse">
          <Icon name="x" size={13} />
        </button>
      </div>
    </div>

    {#if detached}
      <p class="detached-note">
        The text this was attached to is no longer in the document. The note is kept.
      </p>
    {/if}

    <div class="notes">
      {#each flat as { node, depth } (node.id)}
        <div class="note" style="--depth: {Math.min(depth, 4)}">
          {#if depth > 0}<span class="thread-line" aria-hidden="true"></span>{/if}
          <div class="note-head">
            <span class="avatar">{initials(node.author)}</span>
            <span class="who">{node.author}</span>
            <span class="at">{when(node.createdAt)}</span>
            {#if node.updatedAt && node.updatedAt !== node.createdAt}
              <span class="edited">edited</span>
            {/if}
            <span class="grow"></span>
            <button
              class="mini ghost"
              onclick={() => { editing = node.id; editDraft = node.body; }}
              title="Edit"
              aria-label="Edit note"
            ><Icon name="pencil" size={12} /></button>
            <button
              class="mini ghost"
              onclick={() => onDeleteNote(node.id)}
              title="Delete this note and its replies"
              aria-label="Delete note"
            ><Icon name="trash" size={12} /></button>
          </div>

          {#if editing === node.id}
            <textarea
              class="composer"
              bind:value={editDraft}
              use:autoGrow
              onkeydown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submitEdit(); }
                if (e.key === "Escape") { e.stopPropagation(); editing = null; }
              }}
            ></textarea>
            <div class="composer-actions">
              <button class="ghost-btn" onclick={() => (editing = null)}>Cancel</button>
              <button class="primary-btn" onclick={submitEdit}>Save</button>
            </div>
          {:else}
            <p class="body">{node.body}</p>
            <button class="reply-link" onclick={() => { replyTo = node.id; composer?.focus(); }}>
              <Icon name="corner-down-right" size={11} />
              <span>Reply</span>
            </button>
          {/if}
        </div>
      {/each}
    </div>

    <div class="composer-wrap">
      {#if replyTo}
        <div class="replying">
          <Icon name="corner-down-right" size={11} />
          <span>Replying</span>
          <button class="ghost-btn tiny" onclick={() => (replyTo = null)}>cancel</button>
        </div>
      {/if}
      <textarea
        class="composer"
        bind:this={composer}
        bind:value={draft}
        use:autoGrow
        onkeydown={onComposerKey}
        placeholder={ann.thread.length === 0 ? "Add a comment…" : "Reply…"}
        aria-label="Write a note"
      ></textarea>
      {#if draft.trim()}
        <div class="composer-actions">
          <span class="hint">{author} · Ctrl+Enter</span>
          <button class="primary-btn" onclick={submit}>
            {ann.thread.length === 0 ? "Comment" : "Reply"}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ─── Collapsed marker ─────────────────────────────────────────────── */
  .marker {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 22px;
    min-width: 26px;
    padding: 0 6px;
    border-radius: 11px;
    border: 1px solid var(--border);
    background: var(--chrome-bg);
    color: var(--muted-strong);
    cursor: pointer;
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    transition: transform .1s ease, box-shadow .1s ease, color .1s ease;
  }
  .marker:hover {
    transform: translateX(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, .12);
    color: var(--fg-strong);
  }
  /* The marker carries its thread's colour on its left edge, so the mark in the
     text and the mark in the margin are visibly the same object. */
  /* A comment with no fill still needs an identity in the margin: it takes the
     comment mark's own tone rather than borrowing a highlighter colour. */
  .marker.none { border-left: 3px solid var(--accent); }
  .marker.yellow { border-left: 3px solid #e5b800; }
  .marker.green  { border-left: 3px solid #45b06c; }
  .marker.blue   { border-left: 3px solid #3d95d8; }
  .marker.pink   { border-left: 3px solid #e06a90; }
  .marker.purple { border-left: 3px solid #8f6ad4; }
  .marker.resolved { opacity: .5; }
  .marker.detached { border-style: dashed; opacity: .6; }
  .marker .n { font-weight: 600; }

  /* ─── Expanded card ────────────────────────────────────────────────── */
  .card {
    width: 100%;
    border-radius: 10px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent, #999);
    background: var(--chrome-bg);
    box-shadow: 0 3px 14px rgba(0, 0, 0, .1);
    padding: .5rem .55rem .55rem;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--fg);
  }
  .card.none   { --accent: var(--comment-accent, #b4622a); }
  .card.yellow { --accent: #e5b800; }
  .card.green  { --accent: #45b06c; }
  .card.blue   { --accent: #3d95d8; }
  .card.pink   { --accent: #e06a90; }
  .card.purple { --accent: #8f6ad4; }
  .card.resolved { opacity: .72; }
  .card.detached { border-style: dashed; }

  .card-head {
    display: flex;
    align-items: flex-start;
    gap: .3rem;
    margin-bottom: .45rem;
  }
  .quote {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    gap: .4rem;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    text-align: left;
    color: var(--muted-strong);
    font: inherit;
    font-size: 11.5px;
  }
  .quote:hover { color: var(--fg-strong); }
  .quote-bar {
    flex: none;
    width: 2px;
    align-self: stretch;
    border-radius: 1px;
    background: var(--accent);
    opacity: .6;
  }
  /* Two lines of the passage, then an ellipsis. Enough to know which sentence
     without the quote becoming the card. */
  .quote-text {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-style: italic;
  }

  .head-actions { display: flex; align-items: center; gap: 1px; flex: none; }
  .color-wrap { position: relative; }
  .color-pop {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 3px;
    display: flex;
    gap: 3px;
    padding: 4px;
    border-radius: 7px;
    background: var(--chrome-bg);
    border: 1px solid var(--border);
    box-shadow: 0 4px 14px rgba(0, 0, 0, .18);
    z-index: 3;
  }
  .dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, .18);
    cursor: pointer;
    padding: 0;
  }
  .dot.yellow { background: #ffd84d; }
  .dot.green  { background: #7fd99a; }
  .dot.blue   { background: #86c5f5; }
  .dot.pink   { background: #f9a3bd; }
  .dot.purple { background: #c3a5f0; }
  /* No fill. A slashed circle, so it reads as "none" and not as white paint. */
  .dot.none {
    background:
      linear-gradient(to top right,
        transparent calc(50% - .8px), var(--muted-strong) calc(50% - .8px),
        var(--muted-strong) calc(50% + .8px), transparent calc(50% + .8px)),
      var(--bg);
  }
  .dot.on { box-shadow: 0 0 0 1.5px var(--chrome-bg), 0 0 0 3px var(--fg-strong); }

  .mini {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--muted-strong);
    cursor: pointer;
    padding: 0;
  }
  .mini:hover { background: var(--hover-bg); color: var(--fg-strong); }
  .mini.on { color: #45b06c; }
  /* Row actions stay invisible until the note is hovered — four buttons per
     note, always painted, would make a thread read as a control panel. */
  .mini.ghost { opacity: 0; transition: opacity .12s ease; }
  .note:hover .mini.ghost, .mini.ghost:focus-visible { opacity: 1; }

  .detached-note {
    margin: 0 0 .45rem;
    font-size: 11px;
    color: var(--muted-strong);
    font-style: italic;
  }

  .notes { display: flex; flex-direction: column; gap: .5rem; }
  .note {
    position: relative;
    padding-left: calc(var(--depth) * 11px);
  }
  .thread-line {
    position: absolute;
    left: calc(var(--depth) * 11px - 6px);
    top: 4px;
    bottom: 2px;
    width: 1px;
    background: var(--border);
  }
  .note-head {
    display: flex;
    align-items: center;
    gap: .3rem;
    font-size: 11px;
    color: var(--muted-strong);
    min-height: 22px;
  }
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: var(--muted-bg);
    color: var(--fg-strong);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: .02em;
    flex: none;
  }
  .who { font-weight: 600; color: var(--fg-strong); }
  .at { opacity: .75; }
  .edited { opacity: .6; font-style: italic; }
  .grow { flex: 1 1 auto; }

  /* `pre-wrap` because these are prose notes: paragraph breaks the writer typed
     are meaningful, and collapsing them turns three paragraphs into one. */
  .body {
    margin: .15rem 0 .1rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .reply-link {
    display: inline-flex;
    align-items: center;
    gap: .2rem;
    background: none;
    border: 0;
    padding: 0;
    color: var(--muted-strong);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    opacity: 0;
    transition: opacity .12s ease;
  }
  .note:hover .reply-link, .reply-link:focus-visible { opacity: 1; }
  .reply-link:hover { color: var(--fg-strong); text-decoration: underline; }

  .composer-wrap { margin-top: .5rem; }
  .replying {
    display: flex;
    align-items: center;
    gap: .25rem;
    font-size: 10.5px;
    color: var(--muted-strong);
    margin-bottom: .2rem;
  }
  .composer {
    width: 100%;
    min-height: 30px;
    resize: none;
    box-sizing: border-box;
    padding: .35rem .45rem;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 12.5px;
    line-height: 1.5;
    overflow-y: auto;
  }
  .composer:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .composer-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: .35rem;
    margin-top: .3rem;
  }
  .hint { flex: 1 1 auto; font-size: 10.5px; color: var(--muted-strong); }
  .primary-btn, .ghost-btn {
    border-radius: 6px;
    font: inherit;
    font-size: 11.5px;
    padding: .25rem .55rem;
    cursor: pointer;
  }
  .primary-btn {
    border: 1px solid transparent;
    background: var(--fg-strong);
    color: var(--bg);
    font-weight: 600;
  }
  .primary-btn:hover { opacity: .88; }
  .ghost-btn {
    border: 1px solid var(--border);
    background: none;
    color: var(--muted-strong);
  }
  .ghost-btn:hover { background: var(--hover-bg); color: var(--fg-strong); }
  .ghost-btn.tiny { padding: 0 .3rem; font-size: 10.5px; border: 0; text-decoration: underline; }
</style>
