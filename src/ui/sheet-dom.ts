/**
 * DOM kit of the portrait sheets (ROADMAP 58, portrait-sheets.ts): a
 * full-screen panel over the canvas in the game's colours, sized to the
 * visual viewport (so the phone keyboard never hides its buttons), with big
 * text and buttons, its content inside the screen's safe area (display cutouts,
 * ROADMAP 75). Events on it stop there, so the game's window listeners
 * (keys, taps, the blocked page scrolling) never see them; key releases still
 * bubble, so no key stays held for the game. DOM-only, checked by playtest.
 */
import { UI } from './art';
import { SHEET_STYLE } from './portrait-sheets';
import { scrollThumb } from './score-layout';

/** Events that stop at the sheet. */
const STOPPED_EVENTS = ['keydown', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'touchmove', 'mousedown', 'click', 'contextmenu', 'selectstart', 'dblclick', 'wheel'];

const FONT = 'ui-monospace, Menlo, Consolas, monospace';

/**
 * A screen edge's safe-area inset (ROADMAP 75: a punch-hole camera or rounded corner). The custom
 * property `--cc-safe-<side>` on the root element overrides it, so playtests can fake a cutout.
 */
export const safeInset = (side: 'top' | 'right' | 'bottom' | 'left'): string => `var(--cc-safe-${side}, env(safe-area-inset-${side}, 0px))`;

/** A sheet's padding: SHEET_STYLE.padPx, or the safe-area inset where that is larger. */
const SHEET_PADDING = (['top', 'right', 'bottom', 'left'] as const).map((side) => `max(${SHEET_STYLE.padPx}px, ${safeInset(side)})`).join(' ');

/** A sheet's factory: index.ts passes its handlers, tests pass a fake. */
export type SheetFactory<Handlers, Sheet> = (handlers: Handlers) => Sheet;

export interface SheetDom {
  root: HTMLDivElement;
  /** Shows or hides the sheet; while shown it follows the visual viewport. */
  setShown(shown: boolean): void;
}

/** Events on `el` stop there: the game's window listeners never see them (key releases still bubble). */
export function keepEvents(el: HTMLElement): void {
  for (const type of STOPPED_EVENTS) el.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
}

/** Applies `style` to `el`. */
export function styled<E extends HTMLElement>(el: E, style: Partial<CSSStyleDeclaration>): E {
  Object.assign(el.style, style);
  return el;
}

/** An element with text, created once and updated only when the text changes. */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function createSheet(label: string, onEscape: () => void): SheetDom {
  const root = styled(document.createElement('div'), {
    position: 'fixed',
    display: 'none',
    flexDirection: 'column',
    gap: `${SHEET_STYLE.gapPx}px`,
    boxSizing: 'border-box',
    padding: SHEET_PADDING,
    background: UI.ink,
    // The game colour also beyond the box, so a sheet still sized for the keyboard never shows the canvas around it.
    boxShadow: `0 0 0 200vmax ${UI.ink}`,
    color: UI.white,
    fontFamily: FONT,
    fontSize: `${SHEET_STYLE.textPx}px`,
    lineHeight: '1.3',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y',
    zIndex: '3',
  });
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', label);
  keepEvents(root);
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    onEscape();
  });
  document.body.appendChild(root);
  let fitted = '';
  const fit = () => {
    const v = window.visualViewport;
    const box = v ? [v.offsetLeft, v.offsetTop, v.width, v.height] : [0, 0, window.innerWidth, window.innerHeight];
    const key = box.join('|');
    if (key === fitted) return;
    fitted = key;
    styled(root, { left: `${box[0]}px`, top: `${box[1]}px`, width: `${box[2]}px`, height: `${box[3]}px` });
  };
  return {
    root,
    setShown(shown) {
      if (shown) fit();
      const display = shown ? 'flex' : 'none';
      if (root.style.display === display) return;
      if (!shown && root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      root.style.display = display;
    },
  };
}

/** A row of elements side by side, sharing its width. */
export function row(...children: HTMLElement[]): HTMLDivElement {
  const el = styled(document.createElement('div'), { display: 'flex', gap: `${SHEET_STYLE.gapPx}px`, alignItems: 'center' });
  el.append(...children);
  return el;
}

/** A big game-style button (at least SHEET_STYLE.buttonPx tall). */
export function sheetButton(label: string, onPress: () => void): HTMLButtonElement {
  const el = styled(document.createElement('button'), {
    flex: '1 1 0',
    minHeight: `${SHEET_STYLE.buttonPx}px`,
    minWidth: `${SHEET_STYLE.buttonPx}px`,
    padding: '0 12px',
    border: `2px solid ${UI.buttonEdge}`,
    borderRadius: '3px',
    background: UI.buttonFace,
    color: UI.white,
    fontFamily: FONT,
    fontSize: `${SHEET_STYLE.textPx}px`,
    fontWeight: 'bold',
    touchAction: 'manipulation',
    cursor: 'pointer',
  });
  el.type = 'button';
  el.textContent = label;
  el.addEventListener('click', onPress);
  return el;
}

/** Text colour of a button: yellow when it is the one to press (or chosen), muted when it would do nothing yet. */
export function buttonColour(el: HTMLElement, colour: string): void {
  if (el.style.color !== colour) el.style.color = colour;
}

/** A line of text (`size` CSS px). */
export function line(size: number, colour: string = UI.white): HTMLDivElement {
  return styled(document.createElement('div'), { fontSize: `${size}px`, color: colour });
}

/** The headline of a sheet. */
export function title(text: string): HTMLHeadingElement {
  const el = styled(document.createElement('h2'), {
    margin: '0',
    flex: '1 1 auto',
    fontSize: `${SHEET_STYLE.titlePx}px`,
    color: UI.yellow,
  });
  el.textContent = text;
  return el;
}

/** The shared look of the sheets' text fields. */
export const FIELD_STYLE: Partial<CSSStyleDeclaration> = {
  boxSizing: 'border-box',
  width: '100%',
  margin: '0',
  padding: '0.4em 0.5em',
  border: `2px solid ${UI.buttonEdge}`,
  borderRadius: '3px',
  background: UI.buttonFace,
  color: UI.white,
  caretColor: UI.yellow,
  fontFamily: FONT,
  fontSize: `${SHEET_STYLE.textPx}px`,
  outline: 'none',
  userSelect: 'text',
  webkitUserSelect: 'text',
};

const BAR_W = 6;
/** The shortest scroll thumb in CSS px. */
const THUMB_MIN = 24;

export interface ScrollPanel {
  /** The panel to put into the sheet (it takes the free height). */
  frame: HTMLDivElement;
  /** The scrolling content: fill it, then call placeThumb. */
  list: HTMLDivElement;
  placeThumb(): void;
}

/** A panel whose content scrolls natively (touch drag, wheel) with a scroll bar like the canvas lists. */
export function scrollPanel(label: string): ScrollPanel {
  const frame = styled(document.createElement('div'), { position: 'relative', flex: '1 1 auto', minHeight: '0', background: UI.panel, borderRadius: '3px' });
  const list = styled(document.createElement('div'), {
    height: '100%',
    boxSizing: 'border-box',
    padding: `4px ${SHEET_STYLE.padPx + BAR_W}px 8px ${SHEET_STYLE.padPx}px`,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'none',
  });
  list.setAttribute('aria-label', label);
  const track = styled(document.createElement('div'), { position: 'absolute', top: '6px', bottom: '6px', right: '6px', width: `${BAR_W}px`, background: UI.empty });
  const thumb = styled(document.createElement('div'), { position: 'absolute', left: '0', width: '100%', background: UI.muted });
  track.append(thumb);
  frame.append(list, track);
  const placeThumb = () => {
    const t = scrollThumb(track.clientHeight, list.clientHeight, list.scrollHeight, list.scrollTop, THUMB_MIN);
    track.style.display = t ? 'block' : 'none';
    if (t) styled(thumb, { top: `${t.y}px`, height: `${t.h}px` });
  };
  list.addEventListener('scroll', placeThumb, { passive: true });
  new ResizeObserver(placeThumb).observe(list);
  return { frame, list, placeThumb };
}
