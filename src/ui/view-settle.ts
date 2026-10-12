/**
 * When the view has settled after a portrait form closed (ROADMAP 75). Closing
 * the feedback sheet or the name entry in portrait drops the keyboard and, in
 * the installed app, turns the screen back to landscape; meanwhile the window
 * and the visual viewport resize several times, and anything laid out in
 * between is half-sized. The settle cover (settle-cover.ts) hides the screen
 * until this says the size is final: no resize for SETTLE_QUIET_MS, the
 * keyboard down, and landscape when the app locks it; at the latest after
 * SETTLE_MAX_MS. Pure (times in ms).
 */

/** No resize for this long counts as settled. */
export const SETTLE_QUIET_MS = 300;
/** The cover never stays longer than this. */
export const SETTLE_MAX_MS = 2500;
/** The visual viewport this much shorter than the window still counts as no keyboard. */
const KEYBOARD_SLACK = 0.9;

export interface ViewSize {
  /** window.innerWidth / innerHeight. */
  width: number;
  height: number;
  /** visualViewport.height (shorter while the keyboard is up). */
  visualHeight: number;
}

export class ViewSettle {
  private start = 0;
  private lastChange = 0;
  private landscape = false;

  /** A form closed at `now`; `landscape`: the app turns back to landscape (orientation lock). */
  begin(now: number, landscape: boolean): void {
    this.start = now;
    this.lastChange = now;
    this.landscape = landscape;
  }

  /** A resize, visual viewport resize or orientation change at `now`. */
  changed(now: number): void {
    this.lastChange = now;
  }

  settled(now: number, size: ViewSize): boolean {
    if (now - this.start >= SETTLE_MAX_MS) return true;
    const quiet = now - this.lastChange >= SETTLE_QUIET_MS;
    const keyboardDown = size.visualHeight >= size.height * KEYBOARD_SLACK;
    return quiet && keyboardDown && (!this.landscape || size.width > size.height);
  }
}
