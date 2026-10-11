/**
 * The small "Datenschutz" link beside the "Anonyme Statistik" switch (settings
 * menu and "Bestenliste", ROADMAP 47): opens the static datenschutz.html in a
 * new tab. Browsers allow window.open only with user activation, which a
 * touch's pointerdown (where hotspots fire) does not grant; so a press only
 * marks the link, and the open happens in the next user gesture event of the
 * same tap (pointerup, touchend, click: ctx.onUserGesture). A blocked open is
 * retried on the following gesture; a press whose release never comes is
 * forgotten after PRIVACY_PENDING_SECONDS.
 */
import { measureText } from '../core/font';

/** The privacy page, a Vite input next to index.html, relative to the game's URL. */
export const PRIVACY_PAGE = 'datenschutz.html';
export const PRIVACY_LABEL = 'Datenschutz';
/** The link button: the label at scale 1 plus the button's padding. */
export const PRIVACY_LINK_W = measureText(PRIVACY_LABEL, 1) + 12;
/** Space between the statistics switch and the link. */
export const PRIVACY_LINK_GAP = 4;
/** How long a press waits for its release gesture. */
export const PRIVACY_PENDING_SECONDS = 2;

/** Opens `url` in a new tab or window; false when the browser blocked it. */
export type OpenPage = (url: string) => boolean;

export class PrivacyLink {
  /** Seconds the last press still waits for a gesture; 0 = none. */
  private pending = 0;

  constructor(private readonly open: OpenPage | null) {}

  /** The link was pressed (hotspot). */
  request(): void {
    if (this.open) this.pending = PRIVACY_PENDING_SECONDS;
  }

  /** Inside a DOM user gesture event: opens the page if a press waits. */
  gesture(): void {
    if (this.pending <= 0 || !this.open) return;
    let opened = false;
    try {
      opened = this.open(PRIVACY_PAGE);
    } catch {
      // A blocked popup must never break the game; the next gesture retries.
    }
    if (opened) this.pending = 0;
  }

  update(dt: number): void {
    this.pending = Math.max(0, this.pending - dt);
  }
}

/**
 * window.open in a new tab without access back to the game (opener cleared by
 * hand: the "noopener" feature would make window.open return null, so a blocked
 * popup could not be told from an opened one). An installed PWA may hand it to the browser.
 */
export function browserOpenPage(url: string): boolean {
  const page = window.open(new URL(url, document.baseURI).href, '_blank');
  if (!page) return false;
  page.opener = null;
  return true;
}
