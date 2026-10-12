/**
 * The settle cover (ROADMAP 75): a full-screen layer in the game's colours,
 * over every sheet and the rotate screen, shown when a portrait form closes
 * (index.ts blurs the field first, then begins the cover, then locks
 * landscape again). It follows the window and visual viewport resizes and
 * hides once view-settle.ts says the size is final; before it goes it fires one
 * more `resize` so the canvas is laid out at that final size, and it waits two
 * frames so no frame with a half-sized canvas or sheet shows. DOM-only
 * (timers and events, so it works while the game loop is paused), checked by
 * playtest; index.ts uses the SettleCover interface, tests pass a fake.
 */
import { UI } from './art';
import { keepEvents, styled } from './sheet-dom';
import { ViewSettle } from './view-settle';

export interface SettleCover {
  /** Covers the screen until the view settled; `landscape`: the app turns back to landscape. */
  begin(landscape: boolean): void;
}

/** How often the settle is checked while covering (ms). */
const POLL_MS = 50;
const RESIZE_EVENTS = ['resize', 'orientationchange'];

export function createDomSettleCover(): SettleCover {
  const watch = new ViewSettle();
  let root: HTMLDivElement | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const changed = () => watch.changed(performance.now());

  function listen(on: boolean): void {
    const method = on ? 'addEventListener' : 'removeEventListener';
    for (const type of RESIZE_EVENTS) window[method](type, changed);
    window.visualViewport?.[method]('resize', changed);
  }

  function build(): HTMLDivElement {
    // The spread shadow paints the game colour beyond the box too, while the window is still turning.
    const el = styled(document.createElement('div'), {
      position: 'fixed',
      inset: '0',
      background: UI.ink,
      boxShadow: `0 0 0 200vmax ${UI.ink}`,
      zIndex: '10',
      display: 'none',
      touchAction: 'none',
    });
    el.setAttribute('aria-hidden', 'true');
    el.dataset.settleCover = '';
    // A tap on the cover reaches nothing behind it.
    keepEvents(el);
    return document.body.appendChild(el);
  }

  function check(): void {
    const size = { width: window.innerWidth, height: window.innerHeight, visualHeight: window.visualViewport?.height ?? window.innerHeight };
    if (!watch.settled(performance.now(), size)) return;
    clearInterval(timer!);
    timer = null;
    listen(false);
    // The last resize event may have come before the final size: lay the canvas out once more.
    window.dispatchEvent(new Event('resize'));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (timer === null && root) root.style.display = 'none';
      }),
    );
  }

  return {
    begin(landscape) {
      root ??= build();
      root.style.display = 'block';
      watch.begin(performance.now(), landscape);
      if (timer === null) {
        listen(true);
        timer = setInterval(check, POLL_MS);
      }
    },
  };
}
