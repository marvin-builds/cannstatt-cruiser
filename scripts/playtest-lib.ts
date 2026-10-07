/**
 * Shared pieces of the playtest harness: viewports, the scenario context and
 * helpers. Custom scenarios import their types from here.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContextOptions, CDPSession, Page } from 'playwright';
import type { DisplayInfo, GameEvents, GameState } from '../src/types';
import type { LoggedEvent } from '../src/core/testhook';

export interface ViewportSpec {
  name: string;
  options: BrowserContextOptions;
  touch: boolean;
}

export const VIEWPORTS: Record<string, ViewportSpec> = {
  desktop: {
    name: 'desktop',
    touch: false,
    options: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  },
  laptop: {
    name: 'laptop',
    touch: false,
    options: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  },
  'phone-landscape': {
    name: 'phone-landscape',
    touch: true,
    options: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  },
  'phone-portrait': {
    name: 'phone-portrait',
    touch: true,
    options: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  },
};

export interface Check {
  name: string;
  ok: boolean;
  detail?: unknown;
}

export interface LogEntry {
  viewport: string;
  label: string;
  wallTimeMs: number;
  state: GameState;
  extra?: unknown;
}

/** Thin async wrappers around window.__game (see docs/TESTING.md). */
export interface GameDriver {
  seed(n: number): Promise<void>;
  startRun(): Promise<void>;
  /** Freeze the real-time clock (simulation advances only through step). */
  pause(): Promise<void>;
  resume(): Promise<void>;
  step(frames?: number): Promise<GameState>;
  state(): Promise<GameState>;
  press(): Promise<void>;
  release(): Promise<void>;
  tap(frames?: number): Promise<void>;
  hold(frames?: number): Promise<void>;
  pauseGame(): Promise<void>;
  resumeGame(): Promise<void>;
  setZone(index: number): Promise<void>;
  setTimeScale(scale: number): Promise<void>;
  setHealth(health: number): Promise<void>;
  setScore(score: number): Promise<void>;
  /** Difficulty override; null hands the speed back to gameplay. */
  setSpeed(speed: number | null): Promise<void>;
  /** Forces game over while playing. */
  endRun(): Promise<void>;
  events(name?: keyof GameEvents): Promise<LoggedEvent[]>;
  /** Events with `frame >= frame`. */
  eventsSince(frame: number, name?: keyof GameEvents): Promise<LoggedEvent[]>;
  clearEvents(): Promise<void>;
  /** Display info incl. the current adaptive view width. */
  display(): Promise<DisplayInfo>;
  /** Presses for `holdFrames` ticks while frozen and returns the jump's apex height in view pixels. */
  jumpApex(holdFrames: number): Promise<number>;
}

export interface PlaytestContext {
  page: Page;
  viewport: ViewportSpec;
  /** Directory of this viewport's output files. */
  outDir: string;
  game: GameDriver;
  /** Full-page screenshot; returns the file path. */
  screenshot(label: string): Promise<string>;
  /** The game buffer (current view width x 180) upscaled by `scale` (nearest neighbour); returns the file path. */
  canvasShot(label: string, scale?: number): Promise<string>;
  /** Appends the current GameState (plus `extra`) to the run's state log. */
  log(label: string, extra?: unknown): Promise<void>;
  /** Records a pass/fail check; failing checks make the CLI exit non-zero. */
  check(name: string, ok: boolean, detail?: unknown): void;
  /** Real input: Space on desktop, a touch at the screen centre on touch viewports. */
  realPress(holdMs?: number): Promise<void>;
  /**
   * Real pointer press at a view-pixel position (e.g. a hotspot): touch on touch
   * viewports, mouse otherwise. Goes through the real screen->view mapping.
   */
  realTapView(x: number, y: number, holdMs?: number): Promise<void>;
  wait(ms: number): Promise<void>;
}

/** A scenario module default-exports this. */
export type Scenario = (t: PlaytestContext) => Promise<void>;

export function createGameDriver(page: Page): GameDriver {
  const call = <T>(fn: (args: unknown[]) => T, ...args: unknown[]) => page.evaluate(fn, args) as Promise<Awaited<T>>;
  return {
    seed: (n) => call(([v]) => window.__game!.seed(v as number), n),
    startRun: () => call(() => window.__game!.startRun()),
    pause: () => call(() => window.__game!.pause()),
    resume: () => call(() => window.__game!.resume()),
    step: (frames = 1) => call(([f]) => window.__game!.step(f as number), frames),
    state: () => call(() => window.__game!.state()),
    press: () => call(() => window.__game!.input.press()),
    release: () => call(() => window.__game!.input.release()),
    tap: (frames = 2) => call(([f]) => window.__game!.input.tap(f as number), frames),
    hold: (frames = 30) => call(([f]) => window.__game!.input.hold(f as number), frames),
    pauseGame: () => call(() => window.__game!.pauseGame()),
    resumeGame: () => call(() => window.__game!.resumeGame()),
    setZone: (i) => call(([v]) => window.__game!.setZone(v as number), i),
    setTimeScale: (s) => call(([v]) => window.__game!.setTimeScale(v as number), s),
    setHealth: (h) => call(([v]) => window.__game!.setHealth(v as number), h),
    setScore: (s) => call(([v]) => window.__game!.setScore(v as number), s),
    setSpeed: (s) => call(([v]) => window.__game!.setSpeed(v as number | null), s),
    endRun: () => call(() => window.__game!.endRun()),
    events: (name) => call(([n]) => window.__game!.events(n as keyof GameEvents | undefined), name),
    eventsSince: (frame, name) =>
      call(([f, n]) => window.__game!.eventsSince(f as number, n as keyof GameEvents | undefined), frame, name),
    clearEvents: () => call(() => window.__game!.clearEvents()),
    display: () => call(() => window.__game!.display()),
    jumpApex: (holdFrames) =>
      call(([h]) => {
        const g = window.__game!;
        const groundY = g.state().player.y;
        let minY = groundY;
        g.input.press();
        for (let i = 0; i < 180; i++) {
          if (i === h) g.input.release();
          const s = g.step(1);
          minY = Math.min(minY, s.player.y);
          if (i > (h as number) && s.player.grounded) break;
        }
        return groundY - minY;
      }, holdFrames),
  };
}

/** Writes the game buffer, upscaled, to `file`. Usable outside scenarios too. */
export async function captureCanvas(page: Page, file: string, scale = 4): Promise<string> {
  const dataUrl = await page.evaluate((s) => window.__game!.capture(s), scale);
  await writeFile(file, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
  return file;
}

/** Client (CSS px) position of the centre of view pixel (x, y), from the canvas's on-page box. */
export async function viewToClient(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([vx, vy]) => {
      const box = document.querySelector<HTMLCanvasElement>('#game')!.getBoundingClientRect();
      const perPixel = box.height / window.__game!.display().viewHeight;
      return { x: box.left + (vx! + 0.5) * perPixel, y: box.top + (vy! + 0.5) * perPixel };
    },
    [x, y],
  );
}

/** Holds a finger on (x, y) for `ms` via CDP, so touch hold (not only tap) is testable. */
export async function touchHold(cdp: CDPSession, x: number, y: number, ms: number): Promise<void> {
  const point = [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
  await new Promise((r) => setTimeout(r, ms));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function ensureDir(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  return dir;
}

export { join };
