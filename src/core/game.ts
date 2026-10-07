import type {
  DisplayInfo,
  GameCommands,
  GameContext,
  GameEvents,
  GameState,
  Hotspot,
  InputFrame,
  System,
} from '../types';
import { RENDER_LAYERS } from '../types';
import { ActionButton, IDLE_ACTION } from './action';
import { GAMEOVER_INPUT_DELAY, TICK_DT, VIEW_H, VIEW_W } from './config';
import { EventBus } from './events';
import { type ModeCommand, nextMode } from './modes';
import { Rng } from './rng';
import { createInitialState, resetRun } from './state';

/** Browser-side effects the game can trigger; no-ops by default (tests, headless). */
export interface Platform {
  toggleFullscreen(): void;
  setLetterboxColor(color: string): void;
}

export interface GameOptions {
  /** Update order = array order. */
  systems: System[];
  platform?: Partial<Platform>;
}

const IDLE_INPUT: InputFrame = { action: IDLE_ACTION, pausePressed: false, mutePressed: false };

/**
 * Owns the GameState, the event bus, input buttons and the mode machine, and
 * drives all systems one fixed tick at a time. Contains no DOM code.
 */
export class Game {
  readonly state: GameState = createInitialState();
  readonly bus = new EventBus<GameEvents>();
  readonly rng = new Rng(0);
  readonly buttons = { action: new ActionButton(), pause: new ActionButton(), mute: new ActionButton() };
  readonly display: { -readonly [K in keyof DisplayInfo]: DisplayInfo[K] } = {
    portrait: false,
    touch: false,
    fullscreen: false,
    viewWidth: VIEW_W,
    viewHeight: VIEW_H,
  };
  readonly commands: GameCommands;
  readonly ctx: GameContext;

  private readonly systems: System[];
  private readonly hotspots = new Set<Hotspot>();
  private readonly gestureListeners = new Set<() => void>();
  private readonly scheduled: { at: number; fn: () => void }[] = [];
  private input: InputFrame = IDLE_INPUT;
  private seedOverride: number | null = null;
  private speedOverride: number | null = null;

  constructor(options: GameOptions) {
    this.systems = options.systems;
    const platform: Platform = {
      toggleFullscreen: () => {},
      setLetterboxColor: () => {},
      ...options.platform,
    };
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
    for (const sys of this.systems) sys.update?.(this.ctx, TICK_DT);
    this.applySpeedOverride();

    if (s.mode === 'playing') {
      s.time += TICK_DT;
      s.distance += s.speed * TICK_DT;
      if (s.health <= 0) this.endRun();
    } else if (this.input.action.pressed && this.canStartFromInput()) {
      // Done after the systems ran, so the starting press is not also a jump.
      this.startRun();
    }

    this.runScheduled();
  }

  /** Calls every system's render hooks layer by layer, back to front. */
  render(g: CanvasRenderingContext2D, alpha: number): void {
    const r = { g, state: this.state, alpha, display: this.display };
    for (const layer of RENDER_LAYERS) {
      for (const sys of this.systems) sys.render?.[layer]?.(r);
    }
  }

  /** Called by the DOM input layer inside each key / pointer event. */
  notifyUserGesture(): void {
    for (const fn of [...this.gestureListeners]) fn();
  }

  /** Called by input on pointer press (view coords). True if a hotspot took it. */
  hitHotspot(x: number, y: number): boolean {
    for (const h of [...this.hotspots].reverse()) {
      const r = h.rect();
      if (r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
        h.onPress();
        return true;
      }
    }
    return false;
  }

  /** Runs `fn` at the end of the tick `ticks` ticks from now. */
  after(ticks: number, fn: () => void): void {
    this.scheduled.push({ at: this.state.frame + Math.max(1, Math.round(ticks)), fn });
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
    this.bus.emit('runStarted', { seed });
  }

  private endRun(): void {
    if (!this.transition('die')) return;
    const { score, stars, distance } = this.state;
    this.buttons.action.releaseAll();
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

  private runScheduled(): void {
    const due = this.scheduled.filter((t) => t.at <= this.state.frame);
    if (due.length === 0) return;
    this.scheduled.splice(0, this.scheduled.length, ...this.scheduled.filter((t) => t.at > this.state.frame));
    for (const t of due) t.fn();
  }
}
