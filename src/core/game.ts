import type {
  DisplayInfo,
  GameCommands,
  GameContext,
  GameEvents,
  GameState,
  Hotspot,
  InputFrame,
  RenderContext,
  System,
} from '../types';
import { RENDER_LAYERS } from '../types';
import { ActionButton, IDLE_ACTION } from './action';
import { GAMEOVER_INPUT_DELAY, TICK_DT, VIEW_H, VIEW_W } from './config';
import { DelayedButton, drunkDelay, drunkHoldWobble } from './drunk';
import { EventBus } from './events';
import { type InstallEnvironment, InstallController } from './install';
import { type ModeCommand, nextMode } from './modes';
import { Rng } from './rng';
import type { FrameProbe } from './perf';
import { createInitialState, resetRun } from './state';
import { createMemoryStore, type Store } from './storage';
import { loadWhatsNew, markVersionSeen } from './version';

/** Browser-side effects the game can trigger; no-ops by default (tests, headless). */
export interface Platform {
  toggleFullscreen(): void;
  setLetterboxColor(color: string): void;
  /** Reloads the page (location.reload in the browser). */
  reload(): void;
  /** Installed or not, and the device family, for `state.install` (read once at startup). */
  installEnvironment(): InstallEnvironment;
}

/**
 * Core extension of the shared Hotspot (src/types.ts) for hold gestures and
 * modal screens. Pass one to `ctx.addHotspot`; every hook is optional.
 */
export interface InputHotspot extends Hotspot {
  /** The pointer press this hotspot took ended (up, cancel or focus lost). */
  onRelease?(): void;
  /**
   * While `rect()` is non-null, key presses (KeyboardEvent.code) are offered
   * here before they reach a button. Return true to take the key: its button
   * is not pressed, auto-repeats are ignored and its release goes to onKeyUp.
   */
  onKeyDown?(code: string): boolean;
  onKeyUp?(code: string): void;
}

export interface GameOptions {
  /** Update order = array order. */
  systems: System[];
  platform?: Partial<Platform>;
  /** Persistence for the last-seen version and install hint; defaults to a memory store (tests). */
  store?: Store;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const IDLE_INPUT: InputFrame = {
  action: IDLE_ACTION,
  duck: IDLE_ACTION,
  use: IDLE_ACTION,
  pausePressed: false,
  mutePressed: false,
};
/** Mixed into the run seed for the drunk-input rng, so it never shares a sequence with gameplay's rng. */
const DRUNK_SEED_SALT = 0x9e3779b9;
const USE_ITEM_SOURCE = 'command:useItem';

/**
 * Owns the GameState, the event bus, input buttons and the mode machine, and
 * drives all systems one fixed tick at a time. Contains no DOM code.
 */
export class Game {
  readonly state: GameState = createInitialState();
  readonly bus = new EventBus<GameEvents>();
  readonly rng = new Rng(0);
  /** Draws the drunk input delays and hold wobbles; seeded per run from the run seed, separate from the gameplay rng. */
  private readonly drunkRng = new Rng(0);
  private readonly drunkClock = {
    frame: () => this.state.frame,
    delay: () => (this.drunk() ? drunkDelay(this.drunkRng) : 0),
    holdWobble: () => (this.drunk() ? drunkHoldWobble(this.drunkRng) : 0),
  };
  /** Logical buttons. action and duck are delayed while drunk (core/drunk.ts). */
  readonly buttons = {
    action: new DelayedButton(this.drunkClock),
    duck: new DelayedButton(this.drunkClock),
    use: new ActionButton(),
    pause: new ActionButton(),
    mute: new ActionButton(),
  };
  readonly display: Mutable<DisplayInfo> = {
    portrait: false,
    touch: false,
    fullscreen: false,
    viewWidth: VIEW_W,
    viewHeight: VIEW_H,
  };
  readonly commands: GameCommands;
  readonly ctx: GameContext;
  /** The install hint state and captured browser prompt; app.ts forwards beforeinstallprompt / appinstalled. */
  readonly install: InstallController;
  /** Set by the measurement hook (window.__game.perf): books each system's update / render time. */
  probe: FrameProbe | null = null;

  private readonly systems: System[];
  private readonly hotspots = new Set<InputHotspot>();
  /** Keys a hotspot took, until they are released. */
  private readonly takenKeys = new Map<string, InputHotspot>();
  private readonly gestureListeners = new Set<() => void>();
  private readonly scheduled: { at: number; fn: () => void }[] = [];
  private input: InputFrame = IDLE_INPUT;
  /** Reused every frame (render() allocates nothing). */
  private readonly renderContext: Mutable<RenderContext> = {
    g: null as unknown as CanvasRenderingContext2D,
    state: this.state,
    alpha: 0,
    display: this.display,
    scroll: 0,
    scrollLead: 0,
  };
  private seedOverride: number | null = null;
  private speedOverride: number | null = null;

  constructor(options: GameOptions) {
    this.systems = options.systems;
    const platform: Platform = {
      toggleFullscreen: () => {},
      setLetterboxColor: () => {},
      reload: () => {},
      installEnvironment: () => ({ standalone: false, platform: 'other' }),
      ...options.platform,
    };
    const store = options.store ?? createMemoryStore();
    this.state.whatsNew = loadWhatsNew(store);
    this.install = new InstallController(this.state, store);
    this.install.start(platform.installEnvironment());
    this.commands = {
      startRun: () => this.startRun(),
      pause: () => this.transition('pause') && this.bus.emit('pause', {}),
      resume: () => this.transition('resume') && this.bus.emit('resume', {}),
      gameOver: () => this.endRun(),
      toTitle: () => void this.transition('toTitle'),
      setMuted: (muted) => this.setMuted(muted),
      setZone: (index) => this.setZone(index),
      toggleFullscreen: () => platform.toggleFullscreen(),
      setLetterboxColor: (color) => platform.setLetterboxColor(color),
      useItem: () => {
        this.buttons.use.press(USE_ITEM_SOURCE);
        this.buttons.use.release(USE_ITEM_SOURCE);
      },
      reloadForUpdate: () => platform.reload(),
      markVersionSeen: () => markVersionSeen(this.state, store),
      promptInstall: () => this.install.promptInstall(),
      dismissInstallHint: () => this.install.dismiss(),
    };
    const game = this;
    this.ctx = {
      state: this.state,
      bus: this.bus,
      rng: this.rng,
      get input() {
        return game.input;
      },
      display: this.display,
      commands: this.commands,
      get speedOverride() {
        return game.speedOverride;
      },
      addHotspot: (h) => {
        this.hotspots.add(h);
        return () => this.hotspots.delete(h);
      },
      onUserGesture: (fn) => {
        this.gestureListeners.add(fn);
        return () => this.gestureListeners.delete(fn);
      },
    };
    for (const s of this.systems) s.init?.(this.ctx);
  }

  /** Fixes the seed of every following run (test hook / replays). */
  seed(n: number): void {
    this.seedOverride = n >>> 0;
    this.rng.seed(this.seedOverride);
  }

  /** Forces `state.speed` (test hook difficulty override); null hands it back to gameplay. */
  setSpeedOverride(speed: number | null): void {
    this.speedOverride = speed;
    this.applySpeedOverride();
  }

  /** One fixed update of TICK_DT seconds. */
  tick(): void {
    const s = this.state;
    s.frame++;
    s.modeTime += TICK_DT;
    this.input = {
      action: this.buttons.action.tick(TICK_DT),
      duck: this.buttons.duck.tick(TICK_DT),
      use: this.buttons.use.tick(TICK_DT),
      pausePressed: this.buttons.pause.tick(TICK_DT).pressed,
      mutePressed: this.buttons.mute.tick(TICK_DT).pressed,
    };

    if (this.input.pausePressed) {
      if (s.mode === 'playing') this.commands.pause();
      else if (s.mode === 'paused') this.commands.resume();
      else if (s.mode === 'gameover') this.commands.toTitle();
    }
    if (this.input.mutePressed) this.setMuted(!s.muted);

    this.applySpeedOverride();
    this.updateSystems();
    this.applySpeedOverride();

    if (s.mode === 'playing') {
      s.time += TICK_DT;
      s.distance += s.speed * TICK_DT;
      if (s.health <= 0) this.endRun();
    } else if (this.input.action.pressed) {
      // Done after the systems ran, so the starting / resuming press is not also a jump.
      if (s.mode === 'paused') this.commands.resume();
      else if (this.canStartFromInput()) this.startRun();
    }

    this.runScheduled();
  }

  /** Calls every system's render hooks layer by layer, back to front. */
  render(g: CanvasRenderingContext2D, alpha: number): void {
    const r = this.renderContext;
    const s = this.state;
    r.g = g;
    r.alpha = alpha;
    r.scrollLead = s.mode === 'playing' ? alpha * s.speed * TICK_DT : 0;
    r.scroll = s.distance + r.scrollLead;
    const probe = this.probe;
    for (const layer of RENDER_LAYERS) {
      for (let i = 0; i < this.systems.length; i++) {
        const draw = this.systems[i]!.render?.[layer];
        if (!draw) continue;
        if (!probe) {
          draw(r);
          continue;
        }
        const start = performance.now();
        draw(r);
        probe.addSystem(i, 'render', performance.now() - start);
      }
    }
  }

  /** RenderContext.scroll of the last rendered frame (for measurements). */
  get renderedScroll(): number {
    return this.renderContext.scroll;
  }

  /** System names in update order (for measurements). */
  get systemNames(): string[] {
    return this.systems.map((s) => s.name);
  }

  /** Called by the DOM input layer inside each key / pointer event. */
  notifyUserGesture(): void {
    for (const fn of [...this.gestureListeners]) fn();
  }

  /** Called by input on pointer press (view coords). True if a hotspot took it. */
  hitHotspot(x: number, y: number): boolean {
    return this.pressHotspot(x, y) !== null;
  }

  /** Presses the topmost hotspot at (x, y) (later ones win) and returns it, or null. */
  pressHotspot(x: number, y: number): InputHotspot | null {
    for (const h of [...this.hotspots].reverse()) {
      const r = h.rect();
      if (r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
        h.onPress();
        return h;
      }
    }
    return null;
  }

  /** Offers a key press to the active hotspots (topmost first). True if one took it (or holds it already). */
  takeKey(code: string): boolean {
    if (this.takenKeys.has(code)) return true;
    for (const h of [...this.hotspots].reverse()) {
      if (h.onKeyDown && h.rect() && h.onKeyDown(code)) {
        this.takenKeys.set(code, h);
        return true;
      }
    }
    return false;
  }

  /** Ends a key a hotspot took. True if one had it. */
  releaseKey(code: string): boolean {
    const h = this.takenKeys.get(code);
    if (!h) return false;
    this.takenKeys.delete(code);
    h.onKeyUp?.(code);
    return true;
  }

  /** Focus lost: releases every key a hotspot holds. */
  releaseKeys(): void {
    for (const code of [...this.takenKeys.keys()]) this.releaseKey(code);
  }

  /** Runs `fn` at the end of the tick `ticks` ticks from now. */
  after(ticks: number, fn: () => void): void {
    this.scheduled.push({ at: this.state.frame + Math.max(1, Math.round(ticks)), fn });
  }

  /** Whether action / duck input is delayed right now (core/drunk.ts). */
  private drunk(): boolean {
    return this.state.mode === 'playing' && this.state.drunkTimer > 0;
  }

  private canStartFromInput(): boolean {
    const s = this.state;
    return s.mode === 'title' || (s.mode === 'gameover' && s.modeTime >= GAMEOVER_INPUT_DELAY);
  }

  private transition(command: ModeCommand): boolean {
    const next = nextMode(this.state.mode, command);
    if (!next) return false;
    this.state.mode = next;
    this.state.modeTime = 0;
    return true;
  }

  private startRun(): void {
    if (!this.transition('start')) return;
    const seed = this.seedOverride ?? Math.floor(Math.random() * 2 ** 32);
    resetRun(this.state, seed);
    this.applySpeedOverride();
    this.rng.seed(seed);
    this.drunkRng.seed(seed ^ DRUNK_SEED_SALT);
    this.bus.emit('runStarted', { seed });
  }

  private endRun(): void {
    if (!this.transition('die')) return;
    const { score, stars, distance } = this.state;
    this.buttons.action.releaseAll();
    this.buttons.duck.releaseAll();
    this.buttons.use.releaseAll();
    this.bus.emit('gameOver', { score, stars, distance });
  }

  private setMuted(muted: boolean): void {
    this.state.muted = muted;
    this.bus.emit('mute', { muted });
  }

  private setZone(index: number): void {
    const previous = this.state.zoneIndex;
    this.state.zoneIndex = index;
    this.bus.emit('zoneChanged', { index, previous });
  }

  private applySpeedOverride(): void {
    if (this.speedOverride !== null) this.state.speed = this.speedOverride;
  }

  private updateSystems(): void {
    const probe = this.probe;
    for (let i = 0; i < this.systems.length; i++) {
      const sys = this.systems[i]!;
      if (!sys.update) continue;
      if (!probe) {
        sys.update(this.ctx, TICK_DT);
        continue;
      }
      const start = performance.now();
      sys.update(this.ctx, TICK_DT);
      probe.addSystem(i, 'update', performance.now() - start);
    }
  }

  private hasDueTask(): boolean {
    for (const task of this.scheduled) if (task.at <= this.state.frame) return true;
    return false;
  }

  private runScheduled(): void {
    if (!this.hasDueTask()) return;
    const due = this.scheduled.filter((t) => t.at <= this.state.frame);
    this.scheduled.splice(0, this.scheduled.length, ...this.scheduled.filter((t) => t.at > this.state.frame));
    for (const t of due) t.fn();
  }
}
