"""Build the self-test crate's source by EXTRACTING it from the shipped updater.

Why this exists
---------------
`src-tauri/src/updates.rs` carries the logic that decides which release is
newer, which artifact this platform can install, and which hosts a download may
come from. All three are exactly the kind of thing that fails silently: a
version compare that sorts `nightly.10` below `nightly.9` produces an Install
button that never appears, not an error.

Those tests cannot run where they live. A Tauri app crate's test harness links
the whole WebView2/tao stack and dies on this machine with
STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) before a single test runs, and none of
these repos run `cargo test` in CI.

The workaround is a scratch crate — but a scratch crate holding a *retyped*
copy of the logic tests the copy, not the app. So this script slices the real
file and writes what it found. A pass is then evidence about the shipped code,
and a drifting `updates.rs` breaks extraction loudly instead of quietly testing
nothing.

`updates.rs` is byte-identical in wispr-fox, FoxCull, Fox MD and Fox Mark apart
from three per-app constants, so verifying it here verifies all four.

    D:/Python312/python.exe extract.py && cargo test
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / "src-tauri" / "src" / "updates.rs"
OUT = HERE / "src" / "lib.rs"

# (start anchor, end anchor). Everything between them is copied verbatim. The
# end anchor is exclusive and is never itself emitted.
SLICES = [
    ("const ALLOWED_HOSTS:", "/// The event the download emits progress on."),
    ("#[derive(Debug, Deserialize)]\nstruct GhAsset {", "#[derive(Debug, Deserialize)]\nstruct GhRelease {"),
    ("pub fn version_is_newer(", "// \u2500\u2500\u2500 Asset selection"),
    ("fn wanted_suffixes()", "fn to_info("),
    ("fn host_allowed(url: &str) -> bool {", "/// Where downloaded installers are staged."),
    ("#[cfg(test)]\nmod tests {", None),
]

HEADER = """// GENERATED — do not edit. Run `extract.py` instead.
//
// Every line below was sliced out of ../../src-tauri/src/updates.rs, so a
// passing `cargo test` here is evidence about the code the app actually ships,
// not about a copy of it. See extract.py for why this indirection exists.
//
// Only the pure logic is extracted, so the parts of it the app calls from the
// download path have no caller here. That is expected, not rot.
#![allow(dead_code)]

use serde::Deserialize;

"""


def main() -> int:
    src = SOURCE.read_text(encoding="utf-8")
    parts = [HEADER]

    for start, end in SLICES:
        i = src.find(start)
        if i < 0:
            print(f"extract: anchor not found in updates.rs: {start!r}", file=sys.stderr)
            return 1
        j = len(src) if end is None else src.find(end, i)
        if j < 0:
            print(f"extract: end anchor not found after {start!r}: {end!r}", file=sys.stderr)
            return 1
        parts.append(src[i:j].rstrip() + "\n\n")

    body = "".join(parts)

    # `browser_download_url` is only read by the download path, which is not
    # extracted; keep the field so the struct still matches the real one, and
    # silence the resulting dead-code warning rather than editing the slice.
    body = body.replace(
        "#[derive(Debug, Deserialize)]\nstruct GhAsset {",
        "#[allow(dead_code)]\n#[derive(Debug, Deserialize)]\nstruct GhAsset {",
        1,
    )

    OUT.write_text(body, encoding="utf-8")
    fns = len(re.findall(r"^(pub )?fn ", body, re.M))
    tests = len(re.findall(r"^\s*fn ", body, re.M)) - fns
    print(f"extract: wrote {OUT.relative_to(HERE)} — {fns} functions, {tests} tests")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
