//! Diagnostic harness: render samples through the SAME function the app uses
//! and assert the things that have silently broken before.
//!
//! It is not a substitute for a test suite; it is a place to pin down
//! regressions that were expensive to find.
//!
//! **Running it on a GNU-toolchain Windows box needs a detour.** `cargo run
//! --example inspect` links against the crate's cdylib and dies with
//! `export ordinal too large: 105293` — the same 65k DLL export-ordinal limit
//! that stops `cargo test` working here. That is a linker limit on the *Tauri
//! lib*, not a problem with this code.
//!
//! `markdown.rs` only depends on `comrak` and `once_cell`, so the way to
//! actually execute these checks is a throwaway crate that skips Tauri
//! entirely:
//!
//! ```text
//! mkdir mdcheck/src && cd mdcheck
//! cp <repo>/src-tauri/src/markdown.rs      src/markdown.rs
//! cp <repo>/src-tauri/examples/inspect.rs  src/main.rs
//! # then swap `use md_reader_lib::markdown;` for `mod markdown;`
//! # Cargo.toml deps: comrak (default-features = false, features = ["syntect"]), once_cell
//! cargo run
//! ```
//!
//! All 11 checks passed that way on 2026-07-31. On a platform where the
//! example does link, `cargo run --example inspect` works directly.
//!
//! Note also that plain `cargo check` does NOT compile examples — use
//! `cargo check --all-targets` if you want this file type-checked. It was
//! silently left calling an old two-argument `render(&str, bool)` for a while
//! because of exactly that.

use md_reader_lib::markdown;

fn check(name: &str, condition: bool, detail: &str) -> bool {
    if condition {
        println!("  PASS  {name}");
    } else {
        println!("  FAIL  {name}\n        {detail}");
    }
    condition
}

fn main() {
    let mut ok = true;

    // ── Front matter ────────────────────────────────────────────────────
    // Without `front_matter_delimiter`, comrak reads the closing `---` as a
    // setext underline for the metadata above it, and the document opens with
    // an <h2> reading "title: … author: …".
    let fm = markdown::render(
        "---\ntitle: Design notes\nauthor: Adarsh\n---\n\n# Real heading\n\nBody.\n",
        "light",
    );
    ok &= check(
        "YAML front matter is stripped, not rendered as a heading",
        !fm.contains("title: Design notes"),
        &format!("front matter leaked into output:\n{fm}"),
    );
    ok &= check(
        "the document's real H1 survives",
        fm.contains("Real heading"),
        "expected the H1 after the front matter block",
    );

    // ── Tag filter ──────────────────────────────────────────────────────
    // `unsafe_` is on (we want <details>, <div align>, badges), so the GFM tag
    // filter is what stops a .md file from executing script in a webview that
    // holds real capabilities.
    let script = markdown::render("<script>alert(1)</script>\n\nAfter.\n", "light");
    ok &= check(
        "raw <script> is neutralised",
        !script.contains("<script>"),
        &format!("script tag passed through:\n{script}"),
    );

    let details = markdown::render(
        "<details>\n<summary>More</summary>\n\nHidden body.\n\n</details>\n",
        "light",
    );
    ok &= check(
        "...but <details> still renders (the reason unsafe_ is on)",
        details.contains("<details>") && details.contains("<summary>"),
        &format!("details block was filtered too:\n{details}"),
    );

    // ── Tables ──────────────────────────────────────────────────────────
    let table = markdown::render(
        "| Left | Mid | Right |\n|:-----|:---:|------:|\n| a | b | c |\n",
        "light",
    );
    ok &= check(
        "GFM column alignment reaches the HTML",
        table.contains("center") && table.contains("right"),
        &format!("no alignment attributes emitted:\n{table}"),
    );

    // ── Task lists ──────────────────────────────────────────────────────
    let tasks = markdown::render("- [ ] todo\n- [x] done\n- [-] partial\n", "light");
    ok &= check(
        "task items carry a real class (not just a bare input)",
        tasks.contains("task-list-item"),
        &format!("tasklist_classes not applied:\n{tasks}"),
    );

    // ── Sourcepos ───────────────────────────────────────────────────────
    // The frontend indexes .prose children by this attribute; without it,
    // scroll-restore, live-follow, diff mode and Theatre all stop seeing the
    // block.
    ok &= check(
        "blocks still carry data-sourcepos",
        table.contains("data-sourcepos"),
        "sourcepos missing — the whole scroll/diff layer depends on it",
    );

    // ── Themes ──────────────────────────────────────────────────────────
    // Sepia used to fall through to the light adapter, whose palette assumes a
    // white ground.
    let code = "```rust\nfn main() { println!(\"hi\"); }\n```\n";
    let light = markdown::render(code, "light");
    let sepia = markdown::render(code, "sepia");
    let dark = markdown::render(code, "dark");
    ok &= check(
        "sepia has its own syntax palette, distinct from light",
        light != sepia,
        "sepia and light produced identical HTML — adapter not wired",
    );
    ok &= check(
        "dark differs from light too",
        light != dark,
        "dark and light produced identical HTML",
    );

    // ── Extensions that had dead CSS waiting for them ───────────────────
    let dl = markdown::render("Term\n\n: Definition\n", "light");
    ok &= check(
        "description lists render",
        // comrak emits `<dl data-sourcepos=...>`, so match the open tag, not "<dl>".
        dl.contains("<dl") && dl.contains("<dt") && dl.contains("<dd"),
        &format!("description_lists not enabled:\n{dl}"),
    );

    let sup = markdown::render("x^2^ and H~2~O\n", "light");
    ok &= check(
        "superscript and subscript render",
        sup.contains("<sup") && sup.contains("<sub"),
        &format!("super/subscript not enabled:\n{sup}"),
    );

    println!();
    if ok {
        println!("all checks passed");
    } else {
        println!("SOME CHECKS FAILED");
        std::process::exit(1);
    }
}
