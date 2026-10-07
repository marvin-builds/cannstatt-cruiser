/**
 * Shared contracts between core and the feature slices. Changing anything here
 * affects every slice: extend (add optional fields) rather than rename.
 */
import type { ActionSnapshot } from './core/action';
import type { EventBus } from './core/events';
import type { GameMode } from './core/modes';
import type { Rng } from './core/rng';

export type { ActionSnapshot, GameMode };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Animation / logic state of the skater. */
export type PlayerAnim = 'push' | 'ride' | 'jump' | 'air' | 'land' | 'grind' | 'crash' | 'duck';

export interface PlayerState {
  /** Screen x of the board contact point (centre of the deck). */
  x: number;
  /** Screen y of the board contact point; GROUND_Y when riding on the ground. */
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  grinding: boolean;
  state: PlayerAnim;
  /** Collision box in screen coordinates, kept up to date by the player system. */
  hitbox: Rect;
  /** Seconds of remaining invulnerability after a crash (> 0 = blinking). */
  invulnerableTimer: number;
}

/** Ground obstacles, plus overhead ones (banner, stopSign) that hang above the street and are ducked under. */
export type ObstacleKind = 'bin' | 'barrier' | 'bench' | 'planter' | 'curbGap' | 'banner' | 'stopSign';
export type RailKind = 'handrail' | 'pipe';
export type EntityKind = ObstacleKind | RailKind | 'star';

/**
 * Anything gameplay spawns. Coordinates are screen space (view pixels): the
 * gameplay system moves entities left by `speed * dt` each tick.
 */
export interface Entity {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Set once the player has cleared / collected / hit it. */
  done: boolean;
  /** Free-form per-kind data owned by gameplay (variant, colour, ...). */
  data?: Record<string, number | string | boolean>;
}

export interface GameState {
  mode: GameMode;
  /** Seconds spent in the current mode (title animations, game-over delays). */
  modeTime: number;
  /** Seconds since the current run started (only advances while playing). */
  time: number;
  /** Fixed ticks since the app started (all modes). */
  frame: number;
  /** View pixels travelled in this run. Integrated by core from `speed`. */
  distance: number;
  /** Scroll speed in view pixels per second. Set by gameplay (difficulty). */
  speed: number;
  score: number;
  /** Tricks chained without touching the ground or crashing. */
  combo: number;
  /** Score multiplier derived from the combo (>= 1). */
  multiplier: number;
  /** Stars collected in this run. */
  stars: number;
  /**
   * Seconds left of the chill effect from a joint pickup (0 = off). Gameplay
   * sets and counts it down; the player reads it for the reduced jump
   * (CHILL_JUMP_SCALE in player/tuning.ts) and the red-eyes look.
   */
  chillTimer: number;
  health: number;
  maxHealth: number;
  /** Current background zone (0 Stuttgart-Mitte, 1 Neckar, 2 Bad Cannstatt). */
  zoneIndex: number;
  muted: boolean;
  /** Seed used for the current run (rng is re-seeded with it at run start). */
  seed: number;
  player: PlayerState;
  entities: Entity[];
}

type Empty = Record<never, never>;

/** Event names and payloads on the shared bus. */
export interface GameEvents {
  jump: { velocity: number };
  land: { impact: number };
  grindStart: { entityId: number };
  grindEnd: { entityId: number; ticks: number };
  obstacleCleared: { entityId: number; kind: EntityKind; points: number };
  crash: { entityId: number; kind: EntityKind; health: number };
  starCollected: { entityId: number; stars: number };
  chillStart: { entityId: number; duration: number };
  scoreChanged: { score: number; delta: number; combo: number; multiplier: number };
  zoneChanged: { index: number; previous: number };
  runStarted: { seed: number };
  gameOver: { score: number; stars: number; distance: number };
  pause: Empty;
  resume: Empty;
  mute: { muted: boolean };
}

export type GameBus = EventBus<GameEvents>;

/** Input as seen by systems during one tick. */
export interface InputFrame {
  /** The single game action (Space / ArrowUp / W / mouse / touch). */
  readonly action: ActionSnapshot;
  /**
   * Duck (ArrowDown / S held, or a swipe down on touch, which holds it for
   * SWIPE_DUCK_TICKS or until the next tap jumps). A swipe down never also
   * presses the action.
   */
  readonly duck: ActionSnapshot;
  /** P or Escape went down this tick. */
  readonly pausePressed: boolean;
  /** M went down this tick. */
  readonly mutePressed: boolean;
}

/**
 * A screen region (view pixels) that swallows pointer presses instead of
 * treating them as the jump action. `onPress` runs synchronously inside the
 * DOM event, so it may call fullscreen / audio APIs that need a user gesture.
 */
export interface Hotspot {
  /** Current rect, or null while inactive. Called on every pointer press. */
  rect(): Rect | null;
  onPress(): void;
}

export interface DisplayInfo {
  readonly portrait: boolean;
  /** The device has a touch screen (show touch hints instead of key hints). */
  readonly touch: boolean;
  readonly fullscreen: boolean;
  /**
   * Current view width in view pixels (VIEW_W..VIEW_MAX_W). Adapts to the
   * screen aspect and changes live on resize / rotation: never assume 320.
   */
  readonly viewWidth: number;
  /** View height in view pixels (always VIEW_H). */
  readonly viewHeight: number;
}

/** Things systems may ask core to do. All are safe to call in any mode. */
export interface GameCommands {
  startRun(): void;
  pause(): void;
  resume(): void;
  gameOver(): void;
  toTitle(): void;
  setMuted(muted: boolean): void;
  /** Jump to a zone; sets state.zoneIndex and emits zoneChanged. */
  setZone(index: number): void;
  toggleFullscreen(): void;
  /** CSS colour shown around the letterboxed canvas. */
  setLetterboxColor(color: string): void;
}

export interface GameContext {
  readonly state: GameState;
  readonly bus: GameBus;
  /** Seeded per run; use it for everything that affects gameplay. */
  readonly rng: Rng;
  readonly input: InputFrame;
  readonly display: DisplayInfo;
  readonly commands: GameCommands;
  /**
   * Speed forced by the test hook, or null. While set, core pins
   * `state.speed` to it before and after the updates; difficulty code must
   * leave `state.speed` alone.
   */
  readonly speedOverride: number | null;
  /** Registers a pointer hotspot; returns an unregister function. */
  addHotspot(hotspot: Hotspot): () => void;
  /**
   * Runs `fn` synchronously inside every key / pointer DOM event (e.g. to
   * unlock WebAudio). Returns an unsubscribe function.
   */
  onUserGesture(fn: () => void): () => void;
}

/** Draw order, back to front. */
export const RENDER_LAYERS = ['background', 'world', 'entities', 'player', 'fx', 'ui'] as const;
export type RenderLayer = (typeof RENDER_LAYERS)[number];

export interface RenderContext {
  /** The offscreen buffer, `display.viewWidth` x `display.viewHeight`. Draw at integer coordinates. */
  readonly g: CanvasRenderingContext2D;
  readonly state: GameState;
  /** Fraction (0..1) of a tick since the last update, for optional interpolation. */
  readonly alpha: number;
  readonly display: DisplayInfo;
}

export type RenderFn = (r: RenderContext) => void;

/**
 * A feature module. Core calls `init` once, `update` every fixed tick in
 * every mode (check `state.mode`), and each `render` entry once per frame in
 * RENDER_LAYERS order.
 */
export interface System {
  readonly name: string;
  init?(ctx: GameContext): void;
  update?(ctx: GameContext, dt: number): void;
  render?: Partial<Record<RenderLayer, RenderFn>>;
}
