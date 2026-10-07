import type { DisplayInfo, GameEvents, GameState } from '../types';
import type { Game } from './game';

export interface LoggedEvent {
  frame: number;
  name: keyof GameEvents;
  payload: unknown;
}

/** Real-time driver controls the hook needs from the app. */
export interface Clock {
  freeze(): void;
  unfreeze(): void;
  readonly frozen: boolean;
  setTimeScale(scale: number): void;
  /** Renders the current state immediately (so screenshots match after step()). */
  redraw(): void;
  capture(scale: number): string;
}

/** `window.__game`: deterministic control of the game for tests and playtests. See docs/TESTING.md. */
export interface TestHook {
  seed(n: number): void;
  startRun(): void;
  /** Freezes the real-time clock; the simulation only advances via step(). */
  pause(): void;
  /** Unfreezes the real-time clock. */
  resume(): void;
  readonly frozen: boolean;
  /** Advances exactly `frames` fixed ticks (any time; usually while frozen) and redraws. */
  step(frames?: number): GameState;
  /** JSON-safe deep copy of the GameState. */
  state(): GameState;
  input: {
    press(): void;
    release(): void;
    /** Press, keep down for `frames` ticks, release. Steps synchronously when frozen, otherwise schedules the release. */
    tap(frames?: number): void;
    hold(frames?: number): void;
  };
  /** Game-mode pause / resume (the in-game pause screen), unlike pause()/resume(). */
  pauseGame(): void;
  resumeGame(): void;
  setZone(index: number): void;
  setTimeScale(scale: number): void;
  /** Sets `state.health`; core ends a running run on the next tick when it is <= 0. */
  setHealth(health: number): void;
  /** Sets `state.score` (gameplay keeps adding to it). */
  setScore(score: number): void;
  /** Forces the scroll speed (difficulty override) until called with null. */
  setSpeed(speed: number | null): void;
  /** Forces game over now (emits gameOver). Throws unless the mode is `playing`. */
  endRun(): void;
  /** Events since load or the last clearEvents(), oldest first. */
  events(name?: keyof GameEvents): LoggedEvent[];
  /** Logged events with `frame >= frame` (read `state().frame` before acting), oldest first. */
  eventsSince(frame: number, name?: keyof GameEvents): LoggedEvent[];
  clearEvents(): void;
  /** Copy of the display info, including the current adaptive `viewWidth`. */
  display(): DisplayInfo;
  /** PNG data URL of the view buffer (current view width x 180) upscaled by `scale`. */
  capture(scale?: number): string;
}

const MAX_LOG = 5000;

export function createTestHook(game: Game, clock: Clock): TestHook {
  const log: LoggedEvent[] = [];
  game.bus.onAny((name, payload) => {
    log.push({ frame: game.state.frame, name, payload: structuredClone(payload) });
    if (log.length > MAX_LOG) log.shift();
  });

  const snapshot = () => JSON.parse(JSON.stringify(game.state)) as GameState;
  const step = (frames = 1) => {
    for (let i = 0; i < frames; i++) game.tick();
    clock.redraw();
    return snapshot();
  };
  const pressFor = (frames: number) => {
    game.buttons.action.press('test');
    if (clock.frozen) {
      step(frames);
      game.buttons.action.release('test');
    } else {
      game.after(frames, () => game.buttons.action.release('test'));
    }
  };

  return {
    seed: (n) => game.seed(n),
    startRun: () => game.commands.startRun(),
    pause: () => clock.freeze(),
    resume: () => clock.unfreeze(),
    get frozen() {
      return clock.frozen;
    },
    step,
    state: snapshot,
    input: {
      press: () => game.buttons.action.press('test'),
      release: () => game.buttons.action.release('test'),
      tap: (frames = 2) => pressFor(frames),
      hold: (frames = 30) => pressFor(frames),
    },
    pauseGame: () => game.commands.pause(),
    resumeGame: () => game.commands.resume(),
    setZone: (i) => game.commands.setZone(i),
    setTimeScale: (s) => clock.setTimeScale(s),
    setHealth: (health) => void (game.state.health = health),
    setScore: (score) => void (game.state.score = score),
    setSpeed: (speed) => game.setSpeedOverride(speed),
    endRun: () => {
      if (game.state.mode !== 'playing') {
        throw new Error(`endRun() needs mode 'playing', but the mode is '${game.state.mode}'`);
      }
      game.commands.gameOver();
    },
    events: (name) => filterEvents(log, name),
    eventsSince: (frame, name) => filterEvents(log, name).filter((e) => e.frame >= frame),
    clearEvents: () => void log.splice(0),
    display: () => ({ ...game.display }),
    capture: (scale = 4) => clock.capture(scale),
  };
}

function filterEvents(log: LoggedEvent[], name?: keyof GameEvents): LoggedEvent[] {
  return name ? log.filter((e) => e.name === name) : [...log];
}

/** Enabled in dev builds, and in production only with `?test=1`. */
export function testHookEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).get('test') === '1';
}

declare global {
  interface Window {
    __game?: TestHook;
  }
}
