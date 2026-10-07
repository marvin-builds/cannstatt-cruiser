import type { Game } from './game';
import { screenToView, type Layout } from './scaling';

const ACTION_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const MUTE_KEYS = new Set(['KeyM']);
/** Keys whose browser default (scrolling) must never happen. */
const BLOCKED_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown']);

/**
 * Wires keyboard, mouse and touch (via Pointer Events) to the game's logical
 * buttons and blocks scrolling, zooming, selection and context menus.
 * Returns a function that removes all listeners.
 */
export function bindInput(game: Game, getLayout: () => Layout): () => void {
  const swallowedPointers = new Set<number>();
  const opts = { passive: false } as const;
  const listeners: [EventTarget, string, EventListener][] = [];
  const on = <E extends Event>(target: EventTarget, type: string, fn: (e: E) => void) => {
    target.addEventListener(type, fn as EventListener, opts);
    listeners.push([target, type, fn as EventListener]);
  };

  on<KeyboardEvent>(window, 'keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (BLOCKED_KEYS.has(e.code) || ACTION_KEYS.has(e.code) || PAUSE_KEYS.has(e.code)) e.preventDefault();
    game.notifyUserGesture();
    if (ACTION_KEYS.has(e.code)) game.buttons.action.press(`key:${e.code}`);
    if (PAUSE_KEYS.has(e.code)) game.buttons.pause.press(`key:${e.code}`);
    if (MUTE_KEYS.has(e.code)) game.buttons.mute.press(`key:${e.code}`);
  });
  on<KeyboardEvent>(window, 'keyup', (e) => {
    game.buttons.action.release(`key:${e.code}`);
    game.buttons.pause.release(`key:${e.code}`);
    game.buttons.mute.release(`key:${e.code}`);
  });

  on<PointerEvent>(window, 'pointerdown', (e) => {
    e.preventDefault();
    game.notifyUserGesture();
    const p = screenToView(e.clientX, e.clientY, getLayout());
    if (game.hitHotspot(p.x, p.y)) {
      swallowedPointers.add(e.pointerId);
      return;
    }
    game.buttons.action.press(`pointer:${e.pointerId}`);
  });
  const pointerEnd = (e: PointerEvent) => {
    if (swallowedPointers.delete(e.pointerId)) return;
    game.buttons.action.release(`pointer:${e.pointerId}`);
  };
  on(window, 'pointerup', pointerEnd);
  on(window, 'pointercancel', pointerEnd);

  // Touch defaults: scrolling, pinch / double-tap zoom, iOS magnifier and callout.
  const block = (e: Event) => e.preventDefault();
  for (const type of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'contextmenu', 'dblclick', 'selectstart', 'wheel']) {
    on(document, type, block);
  }

  // Never leave the action stuck down when focus is lost.
  const releaseAll = () => {
    game.buttons.action.releaseAll();
    swallowedPointers.clear();
    if (game.state.mode === 'playing') game.commands.pause();
  };
  on(window, 'blur', releaseAll);
  on(document, 'visibilitychange', () => document.hidden && releaseAll());

  return () => {
    for (const [target, type, fn] of listeners) target.removeEventListener(type, fn);
  };
}
