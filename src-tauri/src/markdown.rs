use comrak::plugins::syntect::SyntectAdapter;
use comrak::{markdown_to_html_with_plugins, ExtensionOptions, Options, ParseOptions, Plugins, RenderOptions};
use once_cell::sync::Lazy;

static DARK_ADAPTER: Lazy<SyntectAdapter> =
    Lazy::new(|| SyntectAdapter::new(Some("base16-eighties.dark")));
static LIGHT_ADAPTER: Lazy<SyntectAdapter> =
    Lazy::new(|| SyntectAdapter::new(Some("InspiredGitHub")));
/// Sepia used to fall through to the light adapter, whose palette is tuned for
/// a pure-white ground. Against the cream `--code-bg` that produced the one
/// spot where the sepia theme wasn't honoured. Solarized-light is built for a
/// warm ground and ships with syntect, so it costs nothing to use.
static SEPIA_ADAPTER: Lazy<SyntectAdapter> =
    Lazy::new(|| SyntectAdapter::new(Some("Solarized (light)")));

pub fn render(source: &str, theme: &str) -> String {
    let mut extension = ExtensionOptions::default();
    extension.strikethrough = true;
    extension.table = true;
    extension.tasklist = true;
    extension.footnotes = true;
    extension.alerts = true;
    extension.autolink = true;
    extension.math_dollars = true;
    extension.math_code = true;
    // Intentionally NOT setting header_ids — comrak emits an empty <a class="anchor">
    // inside each heading which causes inconsistent layout/offset issues in WebView2.
    // We assign ids client-side in post-render.ts using the same slug algorithm as Toc.

    // Without a front-matter delimiter, a YAML block is parsed as markdown:
    // the opening `---` becomes a thematic break, and the closing `---` becomes
    // a *setext underline* for the metadata lines above it. Every document with
    // front matter therefore opened with a giant `<h2>` reading
    // "title: … author: …", which also became the first entry in the outline.
    extension.front_matter_delimiter = Some("---".to_string());

    // Definition lists, super/subscript: each is one line, and two of them have
    // had matching CSS sitting in Viewer.svelte doing nothing since v0.1.
    extension.description_lists = true;
    extension.superscript = true;
    extension.subscript = true;

    // GFM's tag filter neutralises <script>, <iframe>, <style>, <textarea>,
    // <title>, <xmp>, <noembed>, <noframes> and <plaintext>. This app opens
    // arbitrary .md files from disk into a webview that holds real capabilities,
    // so raw HTML passing through untouched (`unsafe_`, below) is a genuine
    // execution path, not a theoretical one. The filter costs nothing that
    // matters — <details>, <summary>, <div align>, <img>, badges and comments
    // all still render, which is the whole reason `unsafe_` is on.
    extension.tagfilter = true;

    let mut parse = ParseOptions::default();
    parse.smart = true;
    // `[-]`, `[~]`, `[/]` — the half-done markers AI-written plans use
    // constantly. Without this they render as literal text inside the bullet.
    parse.relaxed_tasklist_matching = true;

    let mut render = RenderOptions::default();
    render.unsafe_ = true;
    render.hardbreaks = false;
    // Emit data-sourcepos="line:col-line:col" on every block element, used by
    // the frontend to map source-line changes back to DOM nodes for live-follow.
    render.sourcepos = true;
    // Gives task items a real class instead of making the CSS depend on a
    // `:has(> input)` selector alone.
    render.tasklist_classes = true;

    let options = Options { extension, parse, render };

    let adapter: &SyntectAdapter = match theme {
        "dark" => &DARK_ADAPTER,
        "sepia" => &SEPIA_ADAPTER,
        _ => &LIGHT_ADAPTER,
    };
    let mut plugins = Plugins::default();
    plugins.render.codefence_syntax_highlighter = Some(adapter);

    markdown_to_html_with_plugins(source, &options, &plugins)
}
