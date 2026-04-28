use comrak::plugins::syntect::SyntectAdapter;
use comrak::{markdown_to_html_with_plugins, ExtensionOptions, Options, ParseOptions, Plugins, RenderOptions};
use once_cell::sync::Lazy;

static DARK_ADAPTER: Lazy<SyntectAdapter> =
    Lazy::new(|| SyntectAdapter::new(Some("base16-ocean.dark")));
static LIGHT_ADAPTER: Lazy<SyntectAdapter> =
    Lazy::new(|| SyntectAdapter::new(Some("InspiredGitHub")));

pub fn render(source: &str, dark: bool) -> String {
    let mut extension = ExtensionOptions::default();
    extension.strikethrough = true;
    extension.table = true;
    extension.tasklist = true;
    extension.footnotes = true;
    extension.alerts = true;
    extension.autolink = true;
    extension.math_dollars = true;
    extension.math_code = true;
    extension.header_ids = Some("h-".to_string());
    extension.tagfilter = false;

    let mut parse = ParseOptions::default();
    parse.smart = true;

    let mut render = RenderOptions::default();
    render.unsafe_ = true;
    render.hardbreaks = false;

    let options = Options { extension, parse, render };

    let adapter: &SyntectAdapter = if dark { &DARK_ADAPTER } else { &LIGHT_ADAPTER };
    let mut plugins = Plugins::default();
    plugins.render.codefence_syntax_highlighter = Some(adapter);

    markdown_to_html_with_plugins(source, &options, &plugins)
}
