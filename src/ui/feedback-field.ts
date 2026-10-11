/**
 * The native text field of the feedback screen: an HTML <textarea> placed
 * over the drawn field (like name-field.ts), so phones open their own
 * keyboard and desktops type straight into it. Keys typed there never reach
 * the game: its keydown, pointer, touch and wheel events stop at the
 * textarea (the game's window and document listeners would block letters
 * such as E, W, S, P, M, Space and the textarea's own scrolling). Key
 * releases still bubble, so no key stays held for the game. Esc closes the
 * screen; Enter is a new line. Font >= 16 CSS px so iOS does not zoom.
 * DOM-only; index.ts uses the FeedbackField interface, and tests pass a fake.
 */
import { VIEW_H } from '../core/config';
import { MAX_FEEDBACK_TEXT } from '../net/feedback-types';
import type { Rect } from '../types';
import { UI } from './art';

export interface FeedbackField {
  /** Shows the textarea over view rect `rect` holding `value`, or hides (and blurs) it for null. Called every tick. */
  place(rect: Rect | null, value: string, placeholder: string): void;
  /** Focuses the textarea (opens the phone keyboard when called inside a user gesture). */
  focus(): void;
}

export interface FeedbackFieldHandlers {
  onInput(value: string): void;
  onCancel(): void;
}

/** Events that stop at the textarea, so the game's own listeners never see them. */
const STOPPED_EVENTS = ['keydown', 'pointerdown', 'touchstart', 'touchend', 'touchmove', 'mousedown', 'contextmenu', 'selectstart', 'dblclick', 'wheel'];

export function createDomFeedbackField(handlers: FeedbackFieldHandlers, canvas: () => HTMLElement | null): FeedbackField {
  let area: HTMLTextAreaElement | null = null;
  let shown = '';

  function create(): HTMLTextAreaElement {
    const el = document.createElement('textarea');
    Object.assign(el, { maxLength: MAX_FEEDBACK_TEXT, spellcheck: true, rows: 3 });
    el.setAttribute('aria-label', 'Dein Feedback');
    el.setAttribute('autocomplete', 'off');
    Object.assign(el.style, {
      position: 'fixed',
      display: 'none',
      boxSizing: 'border-box',
      margin: '0',
      padding: '0.3em 0.45em',
      border: `2px solid ${UI.buttonEdge}`,
      borderRadius: '3px',
      background: UI.buttonFace,
      color: UI.white,
      caretColor: UI.yellow,
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      lineHeight: '1.3',
      outline: 'none',
      resize: 'none',
      overflowY: 'auto',
      userSelect: 'text',
      webkitUserSelect: 'text',
      touchAction: 'pan-y',
      overscrollBehavior: 'contain',
      zIndex: '2',
    });
    for (const type of STOPPED_EVENTS) el.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      handlers.onCancel();
    });
    el.addEventListener('input', () => handlers.onInput(el.value));
    document.body.appendChild(el);
    return el;
  }

  return {
    place(rect, value, placeholder) {
      if (!rect) {
        if (area && area.style.display !== 'none') {
          area.blur();
          area.style.display = 'none';
        }
        return;
      }
      area ??= create();
      if (area.value !== value) area.value = value;
      if (area.placeholder !== placeholder) area.placeholder = placeholder;
      const box = canvas()?.getBoundingClientRect();
      if (!box) return;
      const k = box.height / VIEW_H;
      const style = `${box.left + rect.x * k}|${box.top + rect.y * k}|${rect.w * k}|${rect.h * k}`;
      if (style === shown && area.style.display !== 'none') return;
      shown = style;
      Object.assign(area.style, {
        display: 'block',
        left: `${box.left + rect.x * k}px`,
        top: `${box.top + rect.y * k}px`,
        width: `${rect.w * k}px`,
        height: `${rect.h * k}px`,
        // At least 16 px: iOS zooms the page into smaller inputs.
        fontSize: `${Math.max(16, Math.floor(k * 7))}px`,
      });
    },
    focus() {
      area?.focus({ preventScroll: true });
    },
  };
}
