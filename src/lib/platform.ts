/**
 * Small platform helpers — the things that must differ between Windows,
 * macOS and Linux but are not worth a plugin dependency.
 */

/**
 * True when running on macOS.
 *
 * Deliberately synchronous, and deliberately not `@tauri-apps/plugin-os`:
 * every consumer here is a *label* ("⌘W" vs "Ctrl W") or a *layout* rule
 * (reserve room for the traffic lights). Both are needed during the first
 * render, and an async platform probe would make the toolbar visibly reflow
 * on launch. The user-agent string is stable and correct inside WKWebView.
 *
 * `navigator.platform` is deprecated but still the most reliable signal in
 * WKWebView, so it is tried first with the UA as the fallback.
 */
export const isMac: boolean =
  typeof navigator !== "undefined" &&
  (/mac/i.test(navigator.platform ?? "") ||
    /Macintosh|Mac OS X/i.test(navigator.userAgent ?? ""));

/** The primary modifier's display name for this platform. */
export const MOD = isMac ? "⌘" : "Ctrl";

/**
 * Format a shortcut for display: `sk("W")` → `⌘W` on Mac, `Ctrl W` elsewhere.
 * Mac convention runs the symbols together; Windows/Linux uses a space.
 */
export function sk(...keys: string[]): string {
  const parts = keys.map((k) => (k === "Mod" ? MOD : k));
  return isMac ? parts.join("") : parts.join(" ");
}

/**
 * Copy text to the clipboard.
 *
 * `navigator.clipboard` is tried first, then the `execCommand` fallback.
 * The fallback is not paranoia: the async Clipboard API requires a secure
 * context *and* (in some WebView2 builds) a permission grant that a custom
 * `tauri://` scheme does not always satisfy, and it rejects silently when it
 * fails. The old path has none of those conditions and is uniformly
 * available, which for a one-line "copy this path" is the better trade than
 * pulling in the clipboard plugin and its native clipboard dependencies on
 * three platforms.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the synchronous path.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    // Off-screen rather than hidden: a `display: none` element cannot be
    // selected, and `execCommand("copy")` copies the *selection*.
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    console.error("[md-reader] clipboard write failed", e);
    return false;
  }
}

/**
 * Show a file in Explorer / Finder / the desktop file manager, selected.
 * Imported lazily so the opener plugin is not pulled into the initial bundle
 * for a menu item most sessions never touch.
 */
export async function revealInFileManager(path: string): Promise<void> {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

/** Open a URL in the user's real browser rather than inside the app window. */
export async function openExternal(url: string): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}
