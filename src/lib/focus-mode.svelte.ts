import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Focus mode — the document, and nothing else.
 *
 * Two things happen together, because either alone is unsatisfying: the app
 * chrome (toolbar, tab strip, side panel, sidebars) is hidden, *and* the
 * window goes to native fullscreen. Hiding the chrome inside a windowed frame
 * still leaves the desktop, the taskbar and every other window in view; going
 * fullscreen while keeping the toolbar just makes a bigger app. Reading apps
 * that get this right — iA Writer, Ulysses, Kindle — do both at once.
 *
 * Chrome is not gone forever while in focus mode: pushing the pointer to the
 * very top edge slides the toolbar back down as an overlay, so nothing is
 * unreachable without first leaving. That is the difference between a focus
 * mode and a trap.
 */
class FocusMode {
  /** Chrome hidden + window fullscreen. */
  active = $state(false);
  /** Pointer is at the top edge, so the toolbar is temporarily revealed. */
  peeking = $state(false);
  /** One-shot "press Esc to exit" toast, shown on entry then faded. */
  showHint = $state(false);

  private hintTimer: ReturnType<typeof setTimeout> | null = null;

  async toggle() {
    if (this.active) await this.exit();
    else await this.enter();
  }

  async enter() {
    if (this.active) return;
    this.active = true;
    this.peeking = false;
    this.flashHint();
    await this.setNativeFullscreen(true);
  }

  async exit() {
    if (!this.active) return;
    this.active = false;
    this.peeking = false;
    this.clearHint();
    await this.setNativeFullscreen(false);
  }

  /** Top-edge hover reveal, driven by the page's pointermove handler. */
  setPeek(on: boolean) {
    if (!this.active) {
      this.peeking = false;
      return;
    }
    this.peeking = on;
  }

  private flashHint() {
    this.clearHint();
    this.showHint = true;
    this.hintTimer = setTimeout(() => {
      this.hintTimer = null;
      this.showHint = false;
    }, 2600);
  }

  private clearHint() {
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
    this.showHint = false;
  }

  /**
   * The window call is best-effort on purpose. In `vite dev` (a plain browser
   * tab) there is no Tauri window to drive, and a rejected promise there must
   * not leave the UI stuck half-way into focus mode — the CSS side of the
   * feature works perfectly well on its own.
   */
  private async setNativeFullscreen(on: boolean) {
    try {
      await getCurrentWindow().setFullscreen(on);
    } catch (e) {
      console.warn("[Fox MD] native fullscreen unavailable", e);
    }
  }
}

export const focus = new FocusMode();
