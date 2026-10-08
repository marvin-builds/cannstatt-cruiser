/**
 * Shared contracts between core and the feature slices. Changing anything here
 * affects every slice: extend (add optional fields) rather than rename.
 */
import type { ChangelogEntry } from './changelog';
import type { ActionSnapshot } from './core/action';
import type { EventBus } from './core/events';
import type { InstallPlatform, InstallState } from './core/install';
import type { GameMode } from './core/modes';
import type { Rng } from './core/rng';

export type { ActionSnapshot, ChangelogEntry, GameMode, InstallPlatform, InstallState };

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
  /**
   * Grind trick: down (duck) held while grinding turns the skater to face the
   * player. The player system sets it; gameplay scores it and emits grindTrick.
   */
  grindTrick: boolean;
  state: PlayerAnim;
  /** Collision box in screen coordinates, kept up to date by the player system. */
  hitbox: Rect;
  /** Seconds of remaining invulnerability after a crash (> 0 = blinking). */
  invulnerableTimer: number;
}

/**
 * Ground obstacles (the bench can also be ground on top), people who walk or
 * sway (vfbFan, wasenGuest), plus overhead ones (banner, stopSign) that hang
 * above the street and are ducked under.
 */
export type ObstacleKind =
  | 'bin'
  | 'barrier'
  | 'bench'
  | 'planter'
  | 'curbGap'
  | 'vfbFan'
  | 'wasenGuest'
  | 'banner'
  | 'stopSign';
export type RailKind = 'handrail' | 'pipe';
/**
 * `joint`: the rare pickup that starts the chill effect (state.chillTimer, event chillStart).
 * `ball`: the football the skater threw (gameplay owns it; player and ui only read it).
 */
export type EntityKind = ObstacleKind | RailKind | 'star' | 'joint' | 'ball';

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

/** Loot the skater carries after landing on a person (see the stomp event). */
export type CarriedItem = 'football' | 'pretzel' | 'beer' | 'gingerbread';

/** What using a carried item does: Maßkrug drink, Brezel / Lebkuchenherz eat, football throw. */
export type ItemAction = 'drink' | 'eat' | 'throw';

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
  /**
   * Item under the skater's arm after a stomp + catch, or null. Gameplay sets
   * it on itemCaught and clears it on crash; the player draws it.
   */
  carriedItem: CarriedItem | null;
  /**
   * Seconds left of being drunk after drinking a Maßkrug (0 = sober).
   * Gameplay sets and counts it down; while it is > 0 during a run, core
   * delivers action / duck input late (DRUNK_DELAY_MIN..MAX ticks) and wobbles
   * each press's hold by up to DRUNK_HOLD_WOBBLE ticks (core/drunk.ts).
   * Core zeroes it at every run start.
   */
  drunkTimer: number;
  health: number;
  maxHealth: number;
  /** Current background zone (0 Stuttgart-Mitte, 1 Neckar, 2 Bad Cannstatt); a run starts in START_ZONE. */
  zoneIndex: number;
  /** Foreground traffic in Stuttgart-Mitte, 0..1. The world writes it each tick; audio reads it for traffic noise. */
  trafficDensity: number;
  muted: boolean;
  /**
   * Kid-friendly mode (hidden settings menu, persisted by the UI): the joint
   * pickup becomes a bubble gum with the same effect and no drug references.
   * Kept across runs.
   */
  kidMode: boolean;
  /**
   * A newer deploy is fully cached by the service worker (it posted
   * `{type: 'updateReady'}`, core/update.ts); a reload starts it. Set by core,
   * never cleared, kept across runs. The ui shows the reload hint from it.
   */
  updateReady: boolean;
  /**
   * Changelog entries newer than the stored last-seen version (src/changelog.ts),
   * newest first and capped, computed once at startup. Empty on a first visit and
   * after `commands.markVersionSeen()`. The ui shows "Neu in dieser Version" while
   * it is non-empty. Kept across runs.
   */
  whatsNew: ChangelogEntry[];
  /**
   * Install hint facts (core/install.ts): standalone, platform, canPrompt
   * (a captured beforeinstallprompt), installed, visits, dismissed. Written by
   * core (commands.promptInstall / dismissInstallHint); kept across runs.
   */
  install: InstallState;
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
  /**
   * Gameplay: the falling skater landed on a person's head. The player bounces
   * up with STOMP_BOUNCE_VELOCITY (player/tuning.ts) on the next tick, like a
   * jump take-off without hold; gameplay's jumpsim mirrors it.
   */
  stomp: { entityId: number; kind: EntityKind; item: CarriedItem };
  /** Gameplay: the tossed item reached the skater's hands. */
  itemCaught: { item: CarriedItem };
  /**
   * World: a foreground vehicle passes the skater (its centre crosses PLAYER_X),
   * in every zone. `light` is true outside Mitte's dense traffic. Audio plays a
   * pass-by whoosh from it, so even light traffic is heard.
   */
  vehiclePassed: { kind: 'car' | 'van' | 'bus' | 'truck'; front: boolean; light: boolean };
  /** Gameplay: a grind trick (player.grindTrick) ended while still on the rail or bench, scoring points. */
  grindTrick: { entityId: number; ticks: number; points: number };
  /** Gameplay: the skater used the carried item (use button); state.carriedItem is cleared. */
  itemUsed: { item: CarriedItem; action: ItemAction };
  /** Gameplay: drinking started the drunk effect (`state.drunkTimer = duration`). */
  drunkStart: { duration: number };
  /** Gameplay: eating gave health back; `health` is the new value. */
  healthGained: { health: number };
  /** Gameplay: the football left the hands as entity `entityId` (kind 'ball'). */
  ballThrown: { entityId: number };
  /** Gameplay: the thrown ball hit a person (`entityId` is the person, `kind` its kind). */
  ballHit: { entityId: number; kind: EntityKind };
  /** Gameplay: a missed ball ricochets back towards the skater (ball entity `entityId`). */
  ballBack: { entityId: number };
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
  /**
   * Use the carried item: E, or `commands.useItem()` (a ui hotspot's onPress,
   * pressed and released for one tick). Never delayed by drunk input.
   */
  readonly use: ActionSnapshot;
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
  /**
   * Presses the use button for one tick (a tap: `input.use` is pressed and
   * released on the next tick). For a ui hotspot's onPress, e.g. the item button.
   */
  useItem(): void;
  /** Reloads the page to start the cached new version (see `state.updateReady`); for a ui hotspot. */
  reloadForUpdate(): void;
  /** The player closed the "what's new" screen: stores the running build and empties `state.whatsNew`. */
  markVersionSeen(): void;
  /**
   * Shows the browser's install dialog from the captured `beforeinstallprompt`
   * (only while `state.install.canPrompt`; clears it). Call from a hotspot's onPress (user gesture).
   */
  promptInstall(): void;
  /** "×" on the install hint: sets and persists `state.install.dismissed`. */
  dismissInstallHint(): void;
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
  /** Fraction (0..1) of a tick since the last update (what scroll extrapolates by). */
  readonly alpha: number;
  readonly display: DisplayInfo;
  /**
   * Street distance (view px) to draw the world at this frame: `state.distance`
   * plus `scrollLead` while playing. Use it instead of `state.distance` for
   * parallax and ground offsets, so scrolling moves evenly on 120/144 Hz
   * displays and in frames without an update.
   */
  readonly scroll: number;
  /**
   * `scroll - state.distance` (0 .. one tick of scroll, 0 unless playing).
   * Things that move with the street and live in screen x (entities) are drawn
   * at `x - scrollLead`; round once, after subtracting.
   */
  readonly scrollLead: number;
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
