"""Build the self-test crate by EXTRACTING it from the shipped auth/handover code.

Same reasoning as ../updates-selftest/extract.py, applied to the sign-in and
handover modules:

`cargo test` cannot run where this logic lives. A Tauri app crate's test harness
links the whole WebView2/tao stack and dies on this machine with
STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) before a single test runs. A scratch
crate holding a *retyped* copy would test the copy, so this script slices the
real files instead. A pass is then evidence about the code the app ships, and a
drifting source breaks extraction loudly rather than quietly testing nothing.

What is covered, and why each is worth it — every one of these fails *silently*:

  * `base64url_nopad` — PKCE rejects a padded or non-url-safe challenge with a
    generic "invalid request", which looks like a misconfigured OAuth app.
  * `percent_encode` — an unencoded `redirect_to` truncates the authorize URL at
    the first `:` and Supabase redirects somewhere else entirely.
  * `authorize_url` — a missing `code_challenge_method` makes Supabase treat the
    flow as implicit and the code exchange then fails.
  * `code_from_request_line` — the browser also requests /favicon.ico on the
    callback origin; answering that as if it were the callback aborts sign-in.
  * `now_iso` / `civil_from_days` — a hand-rolled calendar, and the phone sorts
    devices by this string. Off-by-one on a leap day is invisible until March.
  * `b64url_decode` — reads `sub` out of the JWT. Wrong, and every row is
    written with the wrong `user_id` and RLS silently returns nothing.

    D:/Python312/python.exe extract.py && cargo test
"""

import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parents[1] / "src-tauri" / "src"
OUT = HERE / "src" / "lib.rs"

# module name -> (source file, preamble, [(start anchor, end anchor or None)])
# The end anchor is exclusive and never itself emitted.
PLAN = [
    (
        "supabase",
        "supabase.rs",
        "",
        [
            ("pub const SUPABASE_URL:", "/// A signed-in session, as Supabase returns it."),
            ("pub fn percent_encode(", "const B64URL:"),
            ("const B64URL:", "/// Cryptographically random bytes,"),
            ("pub fn random_bytes(", "#[cfg(test)]"),
            ("#[cfg(test)]\nmod tests {", None),
        ],
    ),
    (
        "auth",
        "auth.rs",
        "use super::supabase::*;\nuse sha2::{Digest, Sha256};\n",
        [
            # One slice, ending at the first thing this crate must NOT take
            # (the HTML page). Splitting it earlier would strand a `///` doc
            # comment with no item after it, which is a compile error.
            ("struct Pkce {", "const DONE_PAGE:"),
            ("#[cfg(test)]\nmod tests {", None),
        ],
    ),
    (
        "handover",
        "handover.rs",
        "",
        [
            ("fn now_iso()", "/// This machine's stable id."),
            ("fn b64url_decode(", "/// Announce this device,"),
            ("#[cfg(test)]\nmod tests {", None),
        ],
    ),
]

HEADER = """// GENERATED - do not edit. Run `extract.py` instead.
//
// Every line below was sliced out of ../../src-tauri/src/{{supabase,auth,handover}}.rs,
// so a passing `cargo test` here is evidence about the code the app actually
// ships rather than about a copy of it.
"""


def slice_out(text: str, start: str, end, path: pathlib.Path) -> str:
    i = text.find(start)
    if i == -1:
        sys.exit(f"extract: start anchor not found in {path.name}: {start!r}")
    if end is None:
        return text[i:]
    j = text.find(end, i)
    if j == -1:
        sys.exit(f"extract: end anchor not found in {path.name}: {end!r}")
    return text[i:j]


def main() -> None:
    parts = [HEADER]
    for mod, filename, preamble, slices in PLAN:
        path = SRC / filename
        if not path.exists():
            sys.exit(f"extract: missing source {path}")
        text = path.read_text(encoding="utf-8")
        body = "".join(slice_out(text, a, b, path) for a, b in slices)
        # `use` lines the slice needs but that live outside it. Injected rather
        # than sliced, because the real file's import block also names things
        # (keyring, reqwest) this crate deliberately does not depend on.
        # Injected at MODULE level, not inside `mod tests` — the sliced
        # functions need these imports too, not just the assertions.
        if preamble:
            body = preamble + body
        parts.append(f"\npub mod {mod} {{\n{body}\n}}\n")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("".join(parts), encoding="utf-8")
    lines = len(OUT.read_text(encoding='utf-8').splitlines())
    print(f"wrote {OUT.relative_to(HERE)} ({lines} lines) from {len(PLAN)} modules")


if __name__ == "__main__":
    main()
