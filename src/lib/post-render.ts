// Post-process rendered HTML: lazy-load KaTeX for math, lazy-load Mermaid for diagrams.
// Comrak emits math blocks with `data-math-style="inline"|"display"`,
// and code fences with `class="language-mermaid"`.

let katexLoaded: Promise<typeof import("katex")> | null = null;
let mermaidLoaded: Promise<typeof import("mermaid")> | null = null;

async function loadKatex() {
  if (!katexLoaded) {
    katexLoaded = (async () => {
      // CSS is small (~20 KB); load it alongside the module.
      await import("katex/dist/katex.min.css");
      return await import("katex");
    })();
  }
  return katexLoaded;
}

async function loadMermaid() {
  if (!mermaidLoaded) {
    mermaidLoaded = (async () => {
      const mod = await import("mermaid");
      mod.default.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });
      return mod;
    })();
  }
  return mermaidLoaded;
}

export async function postRender(root: HTMLElement, opts: { dark: boolean }) {
  assignHeadingIds(root);
  wrapTables(root);
  decorateCodeBlocks(root);
  await Promise.all([renderMath(root), renderMermaid(root, opts.dark)]);
}

/**
 * GitHub's heading-slug algorithm. Must stay byte-identical to `baseSlug()`
 * in outline.ts — see the long note there for why the old `h-` prefix and the
 * ASCII-only `\w` class both had to go.
 */
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
  return slug || "section";
}

/**
 * Give every table its own horizontal scroller.
 *
 * A `<table>` cannot scroll itself: `overflow-x: auto` is ignored on
 * `display: table`, and the viewport above it is `overflow-x: hidden`. So any
 * table wider than the prose column — which, in documents full of file paths
 * and repo names, is most of them — had its right-hand columns clipped off
 * with no way to reach them.
 *
 * The wrapper inherits `data-sourcepos`, and that is not optional: the Viewer
 * builds its line→element index by walking `.prose` children and skipping
 * anything without that attribute. An unmarked wrapper would drop every table
 * out of scroll-position restore, live-follow, diff mode and Theatre
 * highlighting at once.
 */
function wrapTables(root: HTMLElement) {
  for (const table of Array.from(root.querySelectorAll<HTMLTableElement>("table"))) {
    if (table.parentElement?.classList.contains("table-scroll")) continue;
    const wrap = document.createElement("div");
    wrap.className = "table-scroll";
    const sourcepos = table.getAttribute("data-sourcepos");
    if (sourcepos) wrap.setAttribute("data-sourcepos", sourcepos);
    table.replaceWith(wrap);
    wrap.appendChild(table);
  }
}

/**
 * Language label + copy button on fenced code blocks.
 *
 * These documents are full of commands the reader is meant to run. Selecting
 * a multi-line shell block by dragging, inside a scroll container, is exactly
 * the friction a reader app should absorb.
 */
function decorateCodeBlocks(root: HTMLElement) {
  for (const pre of Array.from(root.querySelectorAll<HTMLPreElement>("pre"))) {
    if (pre.querySelector(".code-copy")) continue;
    const code = pre.querySelector("code");
    // Mermaid fences are replaced wholesale by renderMermaid below; decorating
    // them would only add a button to something about to be thrown away.
    if (!code || code.classList.contains("language-mermaid")) continue;

    const lang = /language-([\w+#.-]+)/.exec(code.className)?.[1];
    if (lang) pre.dataset.lang = lang;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy";
    btn.textContent = "Copy";
    btn.setAttribute("aria-label", "Copy code to clipboard");
    btn.addEventListener("click", async () => {
      const { copyText } = await import("./platform");
      const ok = await copyText(code.textContent ?? "");
      btn.textContent = ok ? "Copied" : "Failed";
      btn.classList.toggle("ok", ok);
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("ok");
      }, 1300);
    });
    pre.appendChild(btn);
  }
}

function assignHeadingIds(root: HTMLElement) {
  const seen = new Map<string, number>();
  const headings = root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
  headings.forEach((h) => {
    const base = slugify(h.textContent ?? "");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    h.id = n === 0 ? base : `${base}-${n}`;
  });
}

async function renderMath(root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLElement>("[data-math-style]");
  if (nodes.length === 0) return;
  const katex = (await loadKatex()).default;
  for (const node of nodes) {
    const display = node.dataset.mathStyle === "display";
    const tex = node.textContent ?? "";
    try {
      const html = katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        output: "html",
      });
      node.innerHTML = html;
      node.classList.add("math-rendered");
    } catch {
      // leave the original text in place on failure
    }
  }
}

async function renderMermaid(root: HTMLElement, dark: boolean) {
  const blocks = root.querySelectorAll<HTMLElement>("pre > code.language-mermaid");
  if (blocks.length === 0) return;
  const mermaid = (await loadMermaid()).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? "dark" : "default",
    securityLevel: "strict",
  });
  let i = 0;
  for (const code of Array.from(blocks)) {
    const pre = code.parentElement;
    if (!pre) continue;
    const source = code.textContent ?? "";
    const id = `mermaid-${Date.now()}-${i++}`;
    try {
      const { svg } = await mermaid.render(id, source);
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-rendered";
      wrapper.innerHTML = svg;
      pre.replaceWith(wrapper);
    } catch (err) {
      const errBox = document.createElement("div");
      errBox.className = "mermaid-error";
      errBox.textContent = `Mermaid error: ${(err as Error).message ?? err}`;
      pre.appendChild(errBox);
    }
  }
}
