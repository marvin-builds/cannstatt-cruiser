/**
 * DOM kit of the portrait sheets (ROADMAP 58, portrait-sheets.ts): a
 * full-screen panel over the canvas in the game's colours, sized to the
 * visual viewport (so the phone keyboard never hides its buttons), with big
 * text and buttons. Events on it stop there, so the game's window listeners
 * (keys, taps, the blocked page scrolling) never see them; key releases still
 * bubble, so no key stays held for the game. DOM-only, checked by playtest.
 */
import { UI } from './art';
import { SHEET_STYLE } from './portrait-sheets';

/** Events that stop at the sheet. */
const STOPPED_EVENTS = ['keydown', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'touchmove', 'mousedown', 'click', 'contextmenu', 'selectstart', 'dblclick', 'wheel'];

const FONT = 'ui-monospace, Menlo, Consolas, monospace';

/** A sheet's factory: index.ts passes its handlers, tests pass a fake. */
export type SheetFactory<Handlers, Sheet> = (handlers: Handlers) => Sheet;

export interface SheetDom {
  root: HTMLDivElement;
  /** Shows or hides the sheet; while shown it follows the visual viewport. */
  setShown(shown: boolean): void;
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
    padding: `${SHEET_STYLE.padPx}px`,
    background: UI.ink,
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
  for (const type of STOPPED_EVENTS) root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
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
