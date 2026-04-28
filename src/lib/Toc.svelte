<script lang="ts">
  interface Props { source: string }
  let { source = "" }: Props = $props();

  interface Heading {
    level: number;
    text: string;
    id: string;
  }

  function slugify(text: string): string {
    return (
      "h-" +
      text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
    );
  }

  let headings = $derived.by<Heading[]>(() => {
    const out: Heading[] = [];
    const lines = source.split(/\r?\n/);
    let inFence = false;
    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (m) {
        const level = m[1].length;
        const text = m[2];
        out.push({ level, text, id: slugify(text) });
      }
    }
    return out;
  });

  function jump(id: string) {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
</script>

<aside class="toc">
  <div class="toc-title">Outline</div>
  {#if headings.length === 0}
    <div class="toc-empty">No headings</div>
  {:else}
    <ul>
      {#each headings as h}
        <li style="--lvl: {h.level}">
          <button onclick={() => jump(h.id)}>{h.text}</button>
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .toc {
    width: 240px;
    flex: 0 0 240px;
    border-right: 1px solid var(--border);
    background: var(--side-bg);
    overflow-y: auto;
    padding: 1rem .75rem;
    font-size: 13px;
  }
  .toc-title {
    text-transform: uppercase;
    letter-spacing: .06em;
    font-size: 11px;
    color: var(--muted);
    margin-bottom: .5rem;
  }
  .toc-empty { color: var(--muted); font-style: italic; }
  ul { list-style: none; margin: 0; padding: 0; }
  li {
    padding-left: calc((var(--lvl) - 1) * 0.85rem);
  }
  button {
    background: none;
    border: 0;
    padding: .25rem .25rem;
    color: var(--fg);
    text-align: left;
    cursor: pointer;
    width: 100%;
    border-radius: 4px;
    font: inherit;
  }
  button:hover { background: var(--hover-bg); }
</style>
