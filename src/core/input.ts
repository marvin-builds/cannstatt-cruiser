import type { Game, InputHotspot } from './game';
import { screenToView, type Layout } from './scaling';

type ButtonName = keyof Game['buttons'];

/** Keyboard layout: KeyboardEvent.code -> logical button. */
const KEY_BUTTONS: Readonly<Record<string, ButtonName>> = {
  Space: 'action',
  ArrowUp: 'action',
  KeyW: 'action',
  ArrowDown: 'duck',
  KeyS: 'duck',
  KeyE: 'use',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
};
/** Keys whose browser default (scrolling) must never happen. */
const BLOCKED_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown']);

/** Travel (view px, any direction) after which an undecided touch is decided: swipe down or jump. */
export const SWIPE_DISTANCE = 4;
/**
 * A move counts as a swipe down while |dx| <= dy * SWIPE_SLOPE: up to ~50
 * degrees from vertical, so a sloppy ~45 degree swipe still ducks.
 */
export const SWIPE_SLOPE = 1.2;
/**
 * Ticks a touch stays undecided while playing (jump or swipe down?). Lifting
 * the finger or clearly moving decides earlier. See "Touch: tap vs swipe
 * down" in docs/ARCHITECTURE.md for the latency tradeoff.
 */
export const SWIPE_WINDOW = 5;
/** A swipe down holds duck this long (1.2 s), or until the next tap jumps. */
export const SWIPE_DUCK_TICKS = 72;

const SWIPE_SOURCE = 'swipe';

/** A key went down (auto-repeats included): an active hotspot may take it, otherwise its button is pressed. */
export function keyDown(game: Game, code: string): void {
  if (game.takeKey(code)) return;
  const button = KEY_BUTTONS[code];
  if (button) game.buttons[button].press(`key:${code}`);
}

export function keyUp(game: Game, code: string): void {
  if (game.releaseKey(code)) return;
  const button = KEY_BUTTONS[code];
  if (button) game.buttons[button].release(`key:${code}`);
}

interface PendingTouch {
  x: number;
  y: number;
  token: number;
  /** game.state.frame when the finger went down. */
  frame: number;
}

/** A pointer whose action press is down. */
interface ActivePress {
  source: string;
  /** Ticks the press reached the action late (an undecided touch); its release is delayed as long. */
  lag: number;
}

/**
 * Pointer presses (view coordinates) -> action / duck. Mouse presses and
 * touches outside a run press the action at once. A touch during a run is
 * held back for at most SWIPE_WINDOW ticks: moving SWIPE_DISTANCE roughly
 * down (see SWIPE_SLOPE) ducks (and never jumps), lifting the finger, moving
 * another way or the window running out presses the action. Such a late
 * press releases as late as it started, so the action is held exactly as long
 * as the finger was down and a touch jumps as high as an equally long key
 * press. A hotspot that took a press hears its release
 * (InputHotspot.onRelease). DOM-free so it can be unit tested.
 */
export class PointerControls {
  private readonly pending = new Map<number, PendingTouch>();
  /** Pointers whose press a hotspot (or, null, a swipe) took: their release is no action release. */
  private readonly swallowed = new Map<number, InputHotspot | null>();
  private readonly active = new Map<number, ActivePress>();
  private nextToken = 1;
  private swipeDuck = 0;

  constructor(private readonly game: Game) {}

  down(id: number, x: number, y: number, touch: boolean): void {
    const hotspot = this.game.pressHotspot(x, y);
    if (hotspot) {
      this.swallowed.set(id, hotspot);
      return;
    }
    if (!touch || this.game.state.mode !== 'playing') {
      this.press(id);
      return;
    }
    const token = this.nextToken++;
    this.pending.set(id, { x, y, token, frame: this.game.state.frame });
    this.game.after(SWIPE_WINDOW, () => {
      if (this.pending.get(id)?.token === token) this.press(id);
    });
  }

  move(id: number, x: number, y: number): void {
    const start = this.pending.get(id);
    if (!start) return;
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.hypot(dx, dy) < SWIPE_DISTANCE) return;
    if (dy > 0 && Math.abs(dx) <= dy * SWIPE_SLOPE) this.duck(id);
    else this.press(id);
  }

  up(id: number): void {
    if (this.swallowed.has(id)) {
      const hotspot = this.swallowed.get(id);
      this.swallowed.delete(id);
      hotspot?.onRelease?.();
      return;
    }
    if (this.pending.has(id)) this.press(id);
    const press = this.active.get(id);
    if (!press) return;
    this.active.delete(id);
    const action = this.game.buttons.action;
    if (press.lag > 0) this.game.after(press.lag, () => action.release(press.source));
    else action.release(press.source);
  }

  /** The browser took the touch over: no jump for an undecided one. */
  cancel(id: number): void {
    this.pending.delete(id);
    this.up(id);
  }

  /** Focus lost: forget undecided touches and release every button. */
  releaseAll(): void {
    this.pending.clear();
    this.active.clear();
    const held = [...this.swallowed.values()];
    this.swallowed.clear();
    for (const hotspot of held) hotspot?.onRelease?.();
    this.game.releaseKeys();
    this.swipeDuck++;
    for (const button of Object.values(this.game.buttons)) button.releaseAll();
  }

  private press(id: number): void {
    const pending = this.pending.get(id);
    this.pending.delete(id);
    this.endSwipeDuck();
    const token = pending?.token ?? this.nextToken++;
    const source = `pointer:${id}:${token}`;
    this.active.set(id, { source, lag: pending ? this.game.state.frame - pending.frame : 0 });
    this.game.buttons.action.press(source);
  }

  private duck(id: number): void {
    this.pending.delete(id);
    this.swallowed.set(id, null);
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
