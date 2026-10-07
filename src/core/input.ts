import type { Game } from './game';
import { screenToView, type Layout } from './scaling';

type ButtonName = keyof Game['buttons'];

/** Keyboard layout: KeyboardEvent.code -> logical button. */
const KEY_BUTTONS: Readonly<Record<string, ButtonName>> = {
  Space: 'action',
  ArrowUp: 'action',
  KeyW: 'action',
  ArrowDown: 'duck',
  KeyS: 'duck',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
};
/** Keys whose browser default (scrolling) must never happen. */
const BLOCKED_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown']);

/** Downward travel (view px) that turns an undecided touch into a swipe down. */
export const SWIPE_DISTANCE = 5;
/**
 * Ticks a touch stays undecided while playing (jump or swipe down?). Lifting
 * the finger or clearly moving decides earlier. See "Touch: tap vs swipe
 * down" in docs/ARCHITECTURE.md for the latency tradeoff.
 */
export const SWIPE_WINDOW = 5;
/** A swipe down holds duck this long (0.6 s), or until the next tap jumps. */
export const SWIPE_DUCK_TICKS = 36;

const SWIPE_SOURCE = 'swipe';

export function keyDown(game: Game, code: string): void {
  const button = KEY_BUTTONS[code];
  if (button) game.buttons[button].press(`key:${code}`);
}

export function keyUp(game: Game, code: string): void {
  const button = KEY_BUTTONS[code];
  if (button) game.buttons[button].release(`key:${code}`);
}

interface PendingTouch {
  x: number;
  y: number;
  token: number;
}

/**
 * Pointer presses (view coordinates) -> action / duck. Mouse presses and
 * touches outside a run press the action at once. A touch during a run is
 * held back for at most SWIPE_WINDOW ticks: moving down SWIPE_DISTANCE ducks
 * (and never jumps), lifting the finger, moving another way or the window
 * running out presses the action. DOM-free so it can be unit tested.
 */
export class PointerControls {
  private readonly pending = new Map<number, PendingTouch>();
  /** Pointers whose press a hotspot or a swipe took: their release is no action release. */
  private readonly swallowed = new Set<number>();
  private nextToken = 1;
  private swipeDuck = 0;

  constructor(private readonly game: Game) {}

  down(id: number, x: number, y: number, touch: boolean): void {
    if (this.game.hitHotspot(x, y)) {
      this.swallowed.add(id);
      return;
    }
    if (!touch || this.game.state.mode !== 'playing') {
      this.press(id);
      return;
    }
    const token = this.nextToken++;
    this.pending.set(id, { x, y, token });
    this.game.after(SWIPE_WINDOW, () => {
      if (this.pending.get(id)?.token === token) this.press(id);
    });
  }

  move(id: number, x: number, y: number): void {
    const start = this.pending.get(id);
    if (!start) return;
    const dx = x - start.x;
    const dy = y - start.y;
    if (dy >= SWIPE_DISTANCE && dy >= Math.abs(dx)) this.duck(id);
    else if (Math.abs(dx) >= SWIPE_DISTANCE || -dy >= SWIPE_DISTANCE) this.press(id);
  }

  up(id: number): void {
    if (this.swallowed.delete(id)) return;
    if (this.pending.has(id)) this.press(id);
    this.game.buttons.action.release(`pointer:${id}`);
  }

  /** The browser took the touch over: no jump for an undecided one. */
  cancel(id: number): void {
    this.pending.delete(id);
    this.up(id);
  }

  /** Focus lost: forget undecided touches and release every button. */
  releaseAll(): void {
    this.pending.clear();
    this.swallowed.clear();
    this.swipeDuck++;
    for (const button of Object.values(this.game.buttons)) button.releaseAll();
  }

  private press(id: number): void {
    this.pending.delete(id);
    this.endSwipeDuck();
    this.game.buttons.action.press(`pointer:${id}`);
  }

  private duck(id: number): void {
    this.pending.delete(id);
    this.swallowed.add(id);
    const duck = this.game.buttons.duck;
    duck.press(SWIPE_SOURCE);
    const generation = ++this.swipeDuck;
    this.game.after(SWIPE_DUCK_TICKS, () => {
      if (generation === this.swipeDuck) duck.release(SWIPE_SOURCE);
    });
  }

  private endSwipeDuck(): void {
    this.swipeDuck++;
    this.game.buttons.duck.release(SWIPE_SOURCE);
  }
}

/**
 * Wires keyboard, mouse and touch (via Pointer Events) to the game's logical
 * buttons and blocks scrolling, zooming, selection and context menus.
 * Returns a function that removes all listeners.
 */
export function bindInput(game: Game, getLayout: () => Layout): () => void {
  const pointers = new PointerControls(game);
  const opts = { passive: false } as const;
  const listeners: [EventTarget, string, EventListener][] = [];
  const on = <E extends Event>(target: EventTarget, type: string, fn: (e: E) => void) => {
    target.addEventListener(type, fn as EventListener, opts);
    listeners.push([target, type, fn as EventListener]);
  };
  const view = (e: PointerEvent) => screenToView(e.clientX, e.clientY, getLayout());

  on<KeyboardEvent>(window, 'keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (BLOCKED_KEYS.has(e.code) || e.code in KEY_BUTTONS) e.preventDefault();
    game.notifyUserGesture();
    keyDown(game, e.code);
  });
  on<KeyboardEvent>(window, 'keyup', (e) => keyUp(game, e.code));

  on<PointerEvent>(window, 'pointerdown', (e) => {
    e.preventDefault();
    game.notifyUserGesture();
    const p = view(e);
    pointers.down(e.pointerId, p.x, p.y, e.pointerType === 'touch');
  });
  on<PointerEvent>(window, 'pointermove', (e) => {
    const p = view(e);
    pointers.move(e.pointerId, p.x, p.y);
  });
  on<PointerEvent>(window, 'pointerup', (e) => pointers.up(e.pointerId));
  on<PointerEvent>(window, 'pointercancel', (e) => pointers.cancel(e.pointerId));

  // Touch defaults: scrolling, pinch / double-tap zoom, iOS magnifier and callout.
  const block = (e: Event) => e.preventDefault();
  for (const type of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'contextmenu', 'dblclick', 'selectstart', 'wheel']) {
    on(document, type, block);
  }

  // Never leave a button stuck down when focus is lost.
  const releaseAll = () => {
    pointers.releaseAll();
    if (game.state.mode === 'playing') game.commands.pause();
  };
  on(window, 'blur', releaseAll);
  on(document, 'visibilitychange', () => document.hidden && releaseAll());

  return () => {
    for (const [target, type, fn] of listeners) target.removeEventListener(type, fn);
  };
}
