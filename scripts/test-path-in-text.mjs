// Quick check of asAbsolutePath on the shapes paths take in real notes.
// Run: node --experimental-strip-types scripts/test-path-in-text.mjs
import { asAbsolutePath } from "../src/lib/path-in-text.ts";

const cases = [
  ["/Users/kadarsht/code projects/md-reader/src/lib/Viewer.svelte", "/Users/kadarsht/code projects/md-reader/src/lib/Viewer.svelte"],
  ["`/Users/me/OP1 2027/08 - explainers (30 Oct)/plan.md`", "/Users/me/OP1 2027/08 - explainers (30 Oct)/plan.md"],
  ["/Users/me/08 - explainers (30 Oct)", "/Users/me/08 - explainers (30 Oct)"],
  ["(/tmp/x.md)", null], // leading bracket is stripped by tokenAround, not here
  ["/tmp/x.md).", "/tmp/x.md"],
  ["<~/code projects/md-reader>", "~/code projects/md-reader"],
  ["C:\\Users\\me\\notes.md,", "C:\\Users\\me\\notes.md"],
  ["\\\\server\\share\\a.md", "\\\\server\\share\\a.md"],
  ["file:///Users/me/a%20b.md", "/Users/me/a b.md"],
  ["file:///C:/Users/me/a.md", "C:/Users/me/a.md"],
  ["and/or", null],
  ["/", null],
  ["https://example.com/a", null],
  ["relative/path.md", null],
];

let fail = 0;
for (const [input, want] of cases) {
  const got = asAbsolutePath(input);
  const ok = got === want;
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", JSON.stringify(input), "->", JSON.stringify(got));
}
process.exit(fail ? 1 : 0);
