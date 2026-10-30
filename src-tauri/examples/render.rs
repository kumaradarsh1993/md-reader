//! `cargo run --example render < file.md > file.html` — the app's own markdown
//! pipeline on stdin, so the `.docx` exporter can be exercised outside the
//! webview (see `tools/docx-e2e/`).
use std::io::Read;

fn main() {
    let mut src = String::new();
    std::io::stdin().read_to_string(&mut src).expect("read stdin");
    print!("{}", md_reader_lib::markdown::render(&src, "light"));
}
