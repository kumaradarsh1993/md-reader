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
    let source = highlight_to_mark(source);
    let source = source.as_str();
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

/// `==text==` → `<mark>text</mark>`, the common "highlight" extension comrak
/// does not ship (v0.43). It is the reviewer-check marker in the house document
/// format: an author marks their own inference, the reviewer strips it.
///
/// A pre-pass over the source rather than a comrak extension, so one rule
/// serves the reader, the page preview and the `.docx` export alike. It leaves
/// fenced code blocks and inline code spans alone, and only opens on `==`
/// followed by a non-space, closing on `==` preceded by one — so `a == b` in
/// prose is untouched. Line count is preserved, which `sourcepos` depends on;
/// columns on a marked line shift, which nothing depends on.
fn highlight_to_mark(source: &str) -> String {
    if !source.contains("==") {
        return source.to_string();
    }
    let mut out = String::with_capacity(source.len() + 64);
    let mut fence: Option<String> = None;
    for (i, line) in source.split('\n').enumerate() {
        if i > 0 {
            out.push('\n');
        }
        let trimmed = line.trim_start();
        if let Some(f) = &fence {
            out.push_str(line);
            if trimmed.starts_with(f.as_str()) {
                fence = None;
            }
            continue;
        }
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            let ch = trimmed.chars().next().unwrap_or('`');
            let n = trimmed.chars().take_while(|c| *c == ch).count();
            fence = Some(std::iter::repeat(ch).take(n).collect());
            out.push_str(line);
            continue;
        }
        mark_line(line, &mut out);
    }
    out
}

/// One line of `highlight_to_mark`. Works on bytes: every delimiter it looks
/// for is ASCII, so each index it slices at is a char boundary.
fn mark_line(line: &str, out: &mut String) {
    let b = line.as_bytes();
    let n = b.len();
    let mut start = 0;
    let mut i = 0;
    while i < n {
        if b[i] == b'`' {
            // Copy an inline code span verbatim: a run of k backticks closed by
            // the next run of exactly k.
            let k = b[i..].iter().take_while(|c| **c == b'`').count();
            let mut j = i + k;
            let mut closed = None;
            while j < n {
                if b[j] == b'`' {
                    let m = b[j..].iter().take_while(|c| **c == b'`').count();
                    if m == k {
                        closed = Some(j + m);
                        break;
                    }
                    j += m;
                } else {
                    j += 1;
                }
            }
            i = closed.unwrap_or(n);
            continue;
        }
        if b[i] == b'=' && i + 2 < n && b[i + 1] == b'=' && b[i + 2] != b'=' && !b[i + 2].is_ascii_whitespace() {
            // Find the closing `==`: preceded by a non-space, not followed by
            // a third `=`, and no backtick in between.
            let mut j = i + 3;
            let mut end = None;
            while j + 1 < n {
                if b[j] == b'`' {
                    break;
                }
                if b[j] == b'=' && b[j + 1] == b'=' && !b[j - 1].is_ascii_whitespace() && (j + 2 >= n || b[j + 2] != b'=') {
                    end = Some(j);
                    break;
                }
                j += 1;
            }
            if let Some(j) = end {
                out.push_str(&line[start..i]);
                out.push_str("<mark>");
                out.push_str(&line[i + 2..j]);
                out.push_str("</mark>");
                i = j + 2;
                start = i;
                continue;
            }
        }
        i += 1;
    }
    out.push_str(&line[start..]);
}

#[cfg(test)]
mod highlight_tests {
    use super::highlight_to_mark;

    #[test]
    fn marks_plain_span() {
        assert_eq!(highlight_to_mark("a ==b c== d"), "a <mark>b c</mark> d");
    }

    #[test]
    fn leaves_comparison_alone() {
        assert_eq!(highlight_to_mark("if a == b then"), "if a == b then");
    }

    #[test]
    fn skips_inline_code_and_fences() {
        let src = "x `==y==` z\n```\n==in fence==\n```\n==out==";
        assert_eq!(src.matches('\n').count(), highlight_to_mark(src).matches('\n').count());
        assert_eq!(highlight_to_mark(src), "x `==y==` z\n```\n==in fence==\n```\n<mark>out</mark>");
    }

    #[test]
    fn unicode_inside_span() {
        assert_eq!(highlight_to_mark("==₹3.2L=="), "<mark>₹3.2L</mark>");
    }
}
