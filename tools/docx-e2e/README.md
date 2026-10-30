# docx-e2e: the Word export, outside the webview

The exporter (`src/lib/docx/`) walks a DOM, so it cannot run under `cargo test`.
This drives it in Node with a DOM shim, from the app's own Rust render, and
writes a `.docx` you then open in Word.

```sh
cd src-tauri && cargo run -q --example render < ../sample.md > /tmp/sample.html
cd ../tools/docx-e2e && npm i --no-save linkedom@0.18
../../node_modules/.bin/esbuild run.mjs --bundle --platform=node --format=esm \
  --external:linkedom --outfile=run.bundle.mjs
node run.bundle.mjs /tmp/sample.html /tmp/sample.docx "Footer text"
```

Images are resolved relative to the current directory, so run it from the
markdown file's folder (or copy its `images/` beside you).

## The format, in one place

Every number here has a twin in `parts.ts`, `build.ts` and `WordPreview.svelte`.

| Element | Renders as |
|---|---|
| Page | A4; margins 0.75in left/right, 0.8in top/bottom; text column 6.77in; continuous line numbers 0.25in off the text; footer: configurable text left, "Page X of Y" right, Calibri 9pt grey |
| Body | Calibri Light 11pt, justified, 0pt before / 6pt after, single spacing |
| `#` | 12pt bold, full-width 0.75pt rule under it, 0 / 6pt |
| `##` | 11pt bold underlined, 12 / 6pt |
| `###` and deeper | 11pt bold underlined, 6 / 3pt |
| `-` / `1.` lists | marker flush, text 0.25in in, each nested level +0.25in; 3pt between items, 6pt after the last; nested numbers a., b., c. |
| `> quote` | 10pt italic grey 595959, 0.25in indent, no bar; 3pt between its paragraphs |
| `---` | 0.5pt grey A6A6A6 rule, 6pt either side |
| Table | 10pt; header black fill, white bold, repeated per page; borders 0.5pt 8C8C8C; width = text + 0.3in, shifted 0.3in into the left margin; `<!-- widths: a, b, c -->` (inches) above the table sets columns, else equal; all-numeric columns right-aligned |
| Image on its own line | centred, capped at the text width, never upscaled; caption "Figure N: alt" 10pt italic grey centred; no alt = no caption |
| `**b**` `*i*` `<u>u</u>` `==hl==` | bold, italic, underline, yellow highlight |
