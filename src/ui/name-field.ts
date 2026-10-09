/**
 * The native text input of the name entry (adult mode): an HTML <input>
 * placed over the drawn field, so phones open their own keyboard (iOS and
 * Android) and desktops type straight into it. Keys typed there never reach
 * the game: its keydown and touch events stop at the input (the game's
 * window and document listeners would block letters such as E, W, S, P, M,
 * Space and the tap's focus). Key releases still bubble, so no key stays
 * held for the game. DOM-only; index.ts uses the NameField interface, and
 * tests pass a fake.
 */
import { VIEW_H } from '../core/config';
import type { Rect } from '../types';
import { UI } from './art';
import { NAME_MAX } from './score-rules';

export interface NameField {
  /** Shows the input over view rect `rect` holding `value`, or hides (and blurs) it for null. Called every tick. */
  place(rect: Rect | null, value: string): void;
  /** Focuses the input (opens the phone keyboard when called inside a user gesture). */
  focus(): void;
}

export interface NameFieldHandlers {
  onInput(value: string): void;
  onSubmit(): void;
  onCancel(): void;
}

/** Events that stop at the input, so the game's own listeners never see them. */
const STOPPED_EVENTS = ['keydown', 'pointerdown', 'touchstart', 'touchend', 'touchmove', 'mousedown', 'contextmenu', 'selectstart', 'dblclick'];

export function createDomNameField(handlers: NameFieldHandlers, canvas: () => HTMLElement | null): NameField {
  let input: HTMLInputElement | null = null;
  let shown = '';

  function create(): HTMLInputElement {
    const el = document.createElement('input');
    Object.assign(el, {
      type: 'text',
      maxLength: NAME_MAX,
      autocomplete: 'off',
      spellcheck: false,
      placeholder: 'Name',
      enterKeyHint: 'send',
    });
    el.setAttribute('autocapitalize', 'words');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('aria-label', 'Dein Name für die Bestenliste');
    Object.assign(el.style, {
      position: 'fixed',
      display: 'none',
      boxSizing: 'border-box',
      margin: '0',
      padding: '0 0.4em',
      border: `2px solid ${UI.buttonEdge}`,
      borderRadius: '3px',
      background: UI.buttonFace,
      color: UI.yellow,
      caretColor: UI.yellow,
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      fontWeight: 'bold',
      outline: 'none',
      userSelect: 'text',
      webkitUserSelect: 'text',
      touchAction: 'manipulation',
      zIndex: '2',
    });
    for (const type of STOPPED_EVENTS) el.addEventListener(type, (e) => e.stopPropagation());
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlers.onSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handlers.onCancel();
      }
    });
    el.addEventListener('input', () => handlers.onInput(el.value));
    document.body.appendChild(el);
    return el;
  }

  return {
    place(rect, value) {
      if (!rect) {
        if (input && input.style.display !== 'none') {
          input.blur();
          input.style.display = 'none';
        }
        return;
      }
      input ??= create();
      if (input.value !== value) input.value = value;
      const box = canvas()?.getBoundingClientRect();
      if (!box) return;
      const k = box.height / VIEW_H;
      const style = `${box.left + rect.x * k}|${box.top + rect.y * k}|${rect.w * k}|${rect.h * k}`;
      if (style === shown && input.style.display !== 'none') return;
      shown = style;
      // At least 16 px: iOS zooms the page into smaller inputs.
      Object.assign(input.style, {
        display: 'block',
        left: `${box.left + rect.x * k}px`,
        top: `${box.top + rect.y * k}px`,
        width: `${rect.w * k}px`,
        height: `${rect.h * k}px`,
        fontSize: `${Math.max(16, Math.floor(rect.h * k * 0.5))}px`,
      });
    },
    focus() {
      input?.focus({ preventScroll: true });
    },
  };
}
