// Diagnostic harness: render a sample using the SAME render function the app uses,
// then dump the HTML so we can see exactly what tags/classes/attributes are emitted.
// Run with:  cargo run --example inspect

use md_reader_lib::markdown;

fn main() {
    let sample = r#"# UNIFIED CAREER PROFILE — KUMAR ADARSH

**Last updated: April 2026**

This is the unified, consolidated, and authoritative view of Adarsh's complete career profile.

---

## SECTION 1: EXECUTIVE SUMMARY

I am a generalist with strong business, product, growth, and AI strategy exposure.

## SECTION 2: EDUCATION

- **IIT BHU, Varanasi** — B.Tech in Computer Science (2012–2016)
- **IIM Ahmedabad** — MBA (2019–2021)

### Performance

Consistently rated in the top 10% of 40,000-plus Samsung employees globally.

#### Sub-section heading

Some content.

## SECTION 4: TAS — TATA ADMINISTRATIVE SERVICES (June 2021 – June 2022)

Tata Administrative Services is a cadre-based fast-track leadership programme.
"#;

    let html = markdown::render(sample, true);
    println!("{}", html);
}
