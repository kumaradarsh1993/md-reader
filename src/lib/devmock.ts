/**
 * A stand-in for the Tauri backend, so the UI can be driven in a plain browser.
 *
 * ## Why this exists
 *
 * Fox MD is a Tauri app: every file read, every markdown render and every
 * settings write is a Rust command. That makes the frontend unrunnable outside
 * the packaged app — and a Tauri window cannot be driven or screenshotted by
 * agent tooling, while `cargo test` on the app crate cannot even launch its
 * harness on the Windows dev machine (it links the whole WebView2 stack). Until
 * this file, the only way to look at a UI change was to build an installer.
 *
 * Installing `window.__TAURI_INTERNALS__.invoke` is enough, because that is
 * exactly where `@tauri-apps/api`'s `invoke` looks, at call time.
 *
 * **It is off unless `?devmock=1` is in the URL**, and the whole module is
 * tree-shaken out of a production build by the `import.meta.env.DEV` guard at
 * the call site. It is a development instrument, not a fallback: if a real
 * command is missing, the app should fail loudly rather than quietly render
 * fake data.
 *
 * The markdown renderer here is a toy — headings, paragraphs, lists, fences,
 * tables. It exists to produce block elements carrying `data-sourcepos`, which
 * is the contract the Viewer, the outline and the annotation anchors are all
 * written against. It is not, and must never become, a second renderer that
 * anything ships.
 */

const SAMPLE = `# Executive summary

Fox MD is a reader for the markdown you actually work in. This paragraph exists
so there is something long enough to select a phrase out of the middle of, which
is what the annotation layer needs in order to be worth testing at all.

## Findings

The quarterly numbers look inconsistent with what finance circulated last week.
Two of the three regions reconcile; the third does not, and the gap is large
enough that it is unlikely to be a rounding artefact.

- First finding, with a **bold** phrase inside it
- Second finding, rather longer, so that a highlight can be made to span a line
  break and still resolve to one contiguous range in the rendered document
- Third finding

## Recommendation

Hold the deck until the third region is re-derived from source. Everything else
in it is sound, and re-deriving one table is cheaper than retracting a number in
front of the leadership team.

### Appendix

The remaining sections are supporting detail and can be read in any order. They
are here mostly to give the document enough length that the comment lane has to
stack more than one card and make room for them.

Another paragraph, so that a comment anchored near the bottom of the document
has somewhere below it to scroll into.
`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** Enough of comrak's shape to exercise everything that reads sourcepos. */
function renderMock(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const n = h[1].length;
      out.push(`<h${n} data-sourcepos="${i + 1}:1-${i + 1}:${line.length}">${inline(h[2])}</h${n}>`);
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const from = i + 1;
      const items: string[] = [];
      while (i < lines.length && (/^[-*]\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (/^[-*]\s+/.test(lines[i])) items.push(lines[i].replace(/^[-*]\s+/, ""));
        else items[items.length - 1] += " " + lines[i].trim();
        i += 1;
      }
      out.push(
        `<ul data-sourcepos="${from}:1-${i}:1">` +
          items.map((t) => `<li>${inline(t)}</li>`).join("") +
          "</ul>",
      );
      continue;
    }

    const from = i + 1;
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s/.test(lines[i]) && !/^[-*]\s/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p data-sourcepos="${from}:1-${i}:1">${inline(para.join("\n"))}</p>`);
  }
  return out.join("\n");
}

const MOCK_PATH = "D:\\devmock\\Sample brief.md";
const files = new Map<string, string>([[MOCK_PATH, SAMPLE]]);

export function installDevMock(): boolean {
  if (typeof window === "undefined") return false;
  if (!new URLSearchParams(window.location.search).has("devmock")) return false;
  if ((window as any).__TAURI_INTERNALS__) return true;

  const store = new Map<string, unknown>();

  const handlers: Record<string, (a: any) => unknown> = {
    render_markdown: ({ source }) => renderMock(source ?? ""),
    open_file: ({ path }) => ({ path, content: files.get(path) ?? SAMPLE }),
    save_file: ({ path, content }) => { files.set(path, content); },
    read_text_file_opt: ({ path }) => (files.has(path) ? files.get(path) : null),
    write_text_file_mkdir: ({ path, content }) => { files.set(path, content); },
    write_text_file_if_absent: ({ path, content }) => { if (!files.has(path)) files.set(path, content); },
    remove_file_if_present: ({ path }) => { files.delete(path); },
    user_display_name: () => "Adarsh",
    list_dir: () => [{ name: "Sample brief.md", path: MOCK_PATH, is_dir: false, is_md: true, modified: Date.now() }],
    parent_of: () => "D:\\devmock",
    take_initial_files: () => [MOCK_PATH],
    is_torn_out_window: () => false,
    watch_file: () => undefined,
    unwatch_file: () => undefined,
    current_watch: () => null,
    set_titlebar_theme: () => undefined,
    get_secret: () => null,
    update_status: () => ({
      product: "Fox MD",
      current: "dev",
      current_is_nightly: false,
      stable: null,
      nightly: null,
      can_self_install: false,
      update_available: false,
      releases_url: "https://github.com/kumaradarsh1993/md-reader/releases",
    }),
    // plugin:store — the settings store talks to it directly. `entries` has to
    // return an array of pairs; returning undefined makes the settings loader
    // throw "is not iterable" and fall back to defaults, which looks like a
    // settings bug rather than a missing mock.
    "plugin:store|load": () => undefined,
    "plugin:store|get": ({ key }: any) => store.get(key),
    "plugin:store|set": ({ key, value }: any) => { store.set(key, value); },
    "plugin:store|entries": () => [...store.entries()],
    "plugin:store|save": () => undefined,
    "plugin:event|listen": () => 0,
    "plugin:event|unlisten": () => undefined,
    "plugin:app|version": () => "0.0.0-devmock",
    "plugin:app|tauri_version": () => "2.0.0-devmock",
    "plugin:window|is_fullscreen": () => false,
    "plugin:window|set_fullscreen": () => undefined,
  };

  (window as any).__TAURI_INTERNALS__ = {
    invoke: (cmd: string, args: any) => {
      const h = handlers[cmd];
      if (!h) {
        console.warn("[devmock] no handler for", cmd);
        return Promise.resolve(undefined);
      }
      return Promise.resolve(h(args ?? {}));
    },
    transformCallback: (cb: unknown) => cb,
    convertFileSrc: (p: string) => p,
    // `getCurrentWindow()` reads this synchronously at import time.
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  };
  document.documentElement.dataset.devmock = "1";
  console.info("[devmock] Tauri backend mocked — UI only, no real files.");
  return true;
}
