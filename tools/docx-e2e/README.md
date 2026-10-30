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
| Page | A4; margins by preset (house: 0.7in sides, 0.75in top/bottom); continuous line numbers 0.3in off the text; `#` title in the page header with its rule; footer: configurable text left, "Page X of Y" right, Calibri 9pt grey |
| Body | Calibri Light, 10pt default (9–12), justified, 0pt before / 6pt after, single spacing |
| `##` | body size bold underlined, numbered "1." + tab, 12 / 6pt |
| `###` | body size bold underlined, numbered "3.1" + space, 6 / 3pt |
| deeper | as `###` |
| `-` / `1.` lists | marker flush, text 0.25in in, each nested level +0.25in; 3pt between items, 6pt after the last; nested numbers a., b., c. |
| `> quote` | body −1pt italic grey 595959, 0.25in indent, no bar; 3pt between its paragraphs |
| `---` | 0.5pt grey A6A6A6 rule, 6pt either side |
| Table | body −1pt; header black fill, white bold, repeated per page; borders 0.5pt 8C8C8C; width = text + 0.3in, shifted 0.3in into the left margin; `<!-- widths: a, b, c -->` (inches) above the table sets columns, else equal; all-numeric columns right-aligned |
| Image on its own line | centred, capped at the text width, never upscaled; caption "Figure N: alt" 10pt italic grey centred; no alt = no caption |
| `**b**` `*i*` `<u>u</u>` `==hl==` | bold, italic, underline, yellow highlight |
