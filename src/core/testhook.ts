import type { DisplayInfo, GameEvents, GameState } from '../types';
import type { Game } from './game';
import { FrameProbe, type ProbeDump } from './perf';
import { SWIPE_DUCK_TICKS } from './input';
import { handleServiceWorkerMessage, UPDATE_READY_MESSAGE } from './update';

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
    /** Duck (source `test`): held until released; hold() presses for `frames` ticks (default SWIPE_DUCK_TICKS = a swipe, 1.2 s). */
    duck: {
      press(): void;
      release(): void;
      hold(frames?: number): void;
    };
    /** Uses the carried item: the use button pressed for one tick (commands.useItem, like a ui item button). */
    use(): void;
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
  /** Sets `state.drunkTimer` (seconds; gameplay counts it down, input is delayed while > 0). */
  setDrunk(seconds: number): void;
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
  /** Handles the service worker's `{type: 'updateReady'}` message as if a new deploy were cached: sets `state.updateReady`. */
  simulateUpdateReady(): void;
  /** Frame-time probe (scripts/frametimes.ts): records up to `frames` real rAF frames until stop(). */
  perf: {
    start(frames?: number): void;
    stop(): ProbeDump;
  };
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
  const pressFor = (button: Game['buttons']['action'], frames: number) => {
    button.press('test');
    if (clock.frozen) {
      step(frames);
      button.release('test');
    } else {
      game.after(frames, () => button.release('test'));
    }
  };
  const { action, duck } = game.buttons;

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
      press: () => action.press('test'),
      release: () => action.release('test'),
      tap: (frames = 2) => pressFor(action, frames),
      hold: (frames = 30) => pressFor(action, frames),
      duck: {
        press: () => duck.press('test'),
        release: () => duck.release('test'),
        hold: (frames = SWIPE_DUCK_TICKS) => pressFor(duck, frames),
      },
      use: () => game.commands.useItem(),
    },
    pauseGame: () => game.commands.pause(),
    resumeGame: () => game.commands.resume(),
    setZone: (i) => game.commands.setZone(i),
    setTimeScale: (s) => clock.setTimeScale(s),
    setHealth: (health) => void (game.state.health = health),
    setScore: (score) => void (game.state.score = score),
    setDrunk: (seconds) => void (game.state.drunkTimer = seconds),
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
    simulateUpdateReady: () => handleServiceWorkerMessage(game.state, UPDATE_READY_MESSAGE),
    perf: {
      start: (frames = 3600) => void (game.probe = new FrameProbe(game.systemNames, frames)),
      stop: () => {
        const dump = game.probe?.dump() ?? { systems: game.systemNames, frames: [] };
        game.probe = null;
        return dump;
      },
    },
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
