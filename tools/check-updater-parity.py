"""Assert the shared update module really is the same in all four Fox apps.

`docs/UPDATES.md` in each repo says "copy any fix into all four". Nothing
enforces that: the workspace root is not a git repo, the four apps are separate
repositories, and a fix applied to three of them looks exactly like a fix
applied to four. The failure is silent and only shows up as one app behaving
differently months later.

So: run this after touching anything in the update module.

    D:/Python312/python.exe tools/check-updater-parity.py

Exits non-zero and prints a diff on the first mismatch.

`updates.rs` is compared with the three documented per-app constants normalised
away — those are the ONLY lines allowed to differ. `UpdatePanel.svelte` and
`updates.svelte.ts` must match byte for byte, with no exemption: the moment one
is allowed, that is where the drift starts.
"""

import difflib
import pathlib
import re
import sys

# .../md-reader/tools/check-updater-parity.py -> parents[2] is the folder that
# holds all four repos side by side.
WORKSPACE = pathlib.Path(__file__).resolve().parents[2]

# app -> (rust module, panel component, client store)
APPS = {
    "wispr-fox": (
        "wispr-fox/src-tauri/src/updates.rs",
        "wispr-fox/src/lib/UpdatePanel.svelte",
        "wispr-fox/src/lib/updates.svelte.ts",
    ),
    "FoxCull": (
        "FoxCull/src-tauri/src/updates.rs",
        "FoxCull/src/lib/components/UpdatePanel.svelte",
        "FoxCull/src/lib/updates.svelte.ts",
    ),
    "fox-mark": (
        "fox-mark/src-tauri/src/updates.rs",
        "fox-mark/src/lib/components/UpdatePanel.svelte",
        "fox-mark/src/lib/updates.svelte.ts",
    ),
    "md-reader": (
        "md-reader/src-tauri/src/updates.rs",
        "md-reader/src/lib/UpdatePanel.svelte",
        "md-reader/src/lib/updates.svelte.ts",
    ),
}

# The only per-app difference the design permits.
CONSTANTS = re.compile(r'^const (REPO|PRODUCT|UA_NAME): &str = "[^"]*";$', re.M)


def read(rel: str) -> list[str] | None:
    p = WORKSPACE / rel
    if not p.exists():
        return None
    return p.read_text(encoding="utf-8").replace("\r\n", "\n").splitlines(keepends=True)


def compare(label: str, index: int, normalise: bool) -> bool:
    names = list(APPS)
    base_name = names[0]
    base_rel = APPS[base_name][index]
    base = read(base_rel)
    if base is None:
        print(f"MISSING  {base_rel}", file=sys.stderr)
        return False
    if normalise:
        base = CONSTANTS.sub("const NORMALISED;\n", "".join(base)).splitlines(keepends=True)

    ok = True
    for name in names[1:]:
        rel = APPS[name][index]
        other = read(rel)
        if other is None:
            print(f"MISSING  {rel}", file=sys.stderr)
            ok = False
            continue
        if normalise:
            other = CONSTANTS.sub("const NORMALISED;\n", "".join(other)).splitlines(keepends=True)
        if other != base:
            ok = False
            print(f"\nDRIFT  {label}: {base_name} vs {name}", file=sys.stderr)
            sys.stderr.writelines(
                difflib.unified_diff(base, other, base_rel, rel, n=2)
            )
    if ok:
        print(f"OK     {label} — identical across {len(names)} apps")
    return ok


def main() -> int:
    print(f"workspace: {WORKSPACE}")
    results = [
        compare("updates.rs", 0, normalise=True),
        compare("UpdatePanel.svelte", 1, normalise=False),
        compare("updates.svelte.ts", 2, normalise=False),
    ]
    if not all(results):
        print("\nThe update module has drifted. Copy the fix across, then re-run.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
