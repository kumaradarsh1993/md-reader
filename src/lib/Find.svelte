<script lang="ts">
  interface Props {
    open: boolean;
    target: HTMLElement | null;
  }
  let { open = $bindable(false), target }: Props = $props();

  let query = $state("");
  let count = $state(0);
  let current = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (open) {
      queueMicrotask(() => inputEl?.focus());
    } else {
      clearMarks();
    }
  });

  function clearMarks() {
    if (!target) return;
    const marks = target.querySelectorAll<HTMLElement>("mark.find-hit");
    marks.forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(m.textContent ?? ""), m);
      parent.normalize();
    });
  }

  function search() {
    clearMarks();
    count = 0;
    current = 0;
    if (!target || query.length === 0) return;

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.textContent || !node.parentElement) return NodeFilter.FILTER_REJECT;
        // skip script/style/already-marked
        const tag = node.parentElement.tagName.toLowerCase();
        if (tag === "script" || tag === "style") return NodeFilter.FILTER_REJECT;
        if (node.parentElement.classList.contains("find-hit")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const q = query.toLowerCase();
    const hits: { node: Text; index: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node as Text).data.toLowerCase();
      let from = 0;
      while (true) {
        const idx = text.indexOf(q, from);
        if (idx === -1) break;
        hits.push({ node: node as Text, index: idx });
        from = idx + q.length;
      }
    }

    // Apply marks in reverse so indexes remain valid.
    for (let i = hits.length - 1; i >= 0; i--) {
      const { node, index } = hits[i];
      const after = node.splitText(index);
      after.splitText(query.length);
      const mark = document.createElement("mark");
      mark.className = "find-hit";
      mark.textContent = after.data;
      after.parentNode!.replaceChild(mark, after);
    }
    count = hits.length;
    if (count > 0) {
      current = 1;
      scrollToHit(0);
    }
  }

  function scrollToHit(idx: number) {
    if (!target) return;
    const marks = target.querySelectorAll<HTMLElement>("mark.find-hit");
    const el = marks[idx];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    marks.forEach((m, i) => m.classList.toggle("active", i === idx));
  }

  function next() {
    if (count === 0) return;
    current = (current % count) + 1;
    scrollToHit(current - 1);
  }

  function prev() {
    if (count === 0) return;
    current = current === 1 ? count : current - 1;
    scrollToHit(current - 1);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) prev();
      else next();
    } else if (e.key === "Escape") {
      open = false;
    }
  }
</script>

{#if open}
  <div class="find-bar" role="search">
    <input
      bind:this={inputEl}
      bind:value={query}
      oninput={search}
      onkeydown={onKey}
      placeholder="Find in document"
    />
    <span class="counter">{count === 0 ? "0/0" : `${current}/${count}`}</span>
    <button onclick={prev} title="Previous (Shift+Enter)">↑</button>
    <button onclick={next} title="Next (Enter)">↓</button>
    <button onclick={() => (open = false)} title="Close (Esc)">✕</button>
  </div>
{/if}

<style>
  .find-bar {
    position: absolute;
    top: 8px;
    right: 16px;
    display: flex;
    gap: .35rem;
    align-items: center;
    background: var(--toolbar-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: .35rem .5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .12);
    z-index: 10;
  }
  input {
    background: var(--input-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: .25rem .5rem;
    font: inherit;
    width: 18rem;
  }
  .counter { color: var(--muted); font-size: 12px; min-width: 3em; text-align: right; }
  button {
    background: none;
    border: 0;
    color: var(--fg);
    cursor: pointer;
    padding: .15rem .4rem;
    border-radius: 4px;
  }
  button:hover { background: var(--hover-bg); }
</style>
