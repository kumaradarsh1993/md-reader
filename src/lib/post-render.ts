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
  await Promise.all([renderMath(root), renderMermaid(root, opts.dark)]);
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
