import { describe, expect, it, vi } from 'vitest';
import { BUILD_VERSION } from '../changelog';
import type { EntityKind, GameEvents, GameState, RenderContext, RenderLayer, System } from '../types';
import { BASE_SPEED, GAMEOVER_INPUT_DELAY, MAX_HEALTH, TICK_DT, VIEW_H, VIEW_W } from './config';
import { Game } from './game';
import { INSTALL_HINT_DISMISSED_KEY } from './install';
import { createMemoryStore } from './storage';
import { LAST_SEEN_VERSION_KEY } from './version';

function tapAction(game: Game): void {
  game.buttons.action.press('test');
  game.tick();
  game.buttons.action.release('test');
  game.tick();
}

function ticks(game: Game, n: number): void {
  for (let i = 0; i < n; i++) game.tick();
}

function recordEvents(game: Game): string[] {
  const names: string[] = [];
  game.bus.onAny((name) => names.push(name as string));
  return names;
}

describe('Game', () => {
  it('starts on the title screen with full health', () => {
    const game = new Game({ systems: [] });
    expect(game.state.mode).toBe('title');
    expect(game.state.health).toBe(MAX_HEALTH);
  });

  it('starts a run when the action is pressed on the title screen', () => {
    const seen: string[] = [];
    const sys: System = { name: 'spy', update: (ctx) => void seen.push(ctx.state.mode) };
    const game = new Game({ systems: [sys] });
    const events = recordEvents(game);
    game.buttons.action.press('test');
    game.tick();
    expect(seen).toEqual(['title']);
    expect(game.state.mode).toBe('playing');
    expect(events).toContain('runStarted');
  });

  it('does not report the starting press again on the first playing tick', () => {
    const presses: boolean[] = [];
    const sys: System = { name: 'spy', update: (ctx) => void presses.push(ctx.input.action.pressed) };
    const game = new Game({ systems: [sys] });
    game.buttons.action.press('test');
    ticks(game, 2);
    expect(presses).toEqual([true, false]);
  });

  it('integrates time and distance from speed only while playing', () => {
    const game = new Game({ systems: [] });
    ticks(game, 10);
    expect(game.state.distance).toBe(0);
    game.commands.startRun();
    ticks(game, 60);
    expect(game.state.speed).toBe(BASE_SPEED);
    expect(game.state.time).toBeCloseTo(1, 5);
    expect(game.state.distance).toBeCloseTo(BASE_SPEED, 3);
  });

  it('toggles pause with the pause key and freezes the run clock', () => {
    const game = new Game({ systems: [] });
    const events = recordEvents(game);
    game.commands.startRun();
    game.buttons.pause.press('key');
    game.tick();
    game.buttons.pause.release('key');
    expect(game.state.mode).toBe('paused');
    const t = game.state.time;
    ticks(game, 30);
    expect(game.state.time).toBe(t);
    game.buttons.pause.press('key');
    game.tick();
    expect(game.state.mode).toBe('playing');
    expect(events).toEqual(expect.arrayContaining(['pause', 'resume']));
  });

  it('resumes from pause with the jump action, without the press also jumping', () => {
    const presses: boolean[] = [];
    const sys: System = { name: 'spy', update: (ctx) => void (ctx.state.mode === 'playing' && presses.push(ctx.input.action.pressed)) };
    const game = new Game({ systems: [sys] });
    const events = recordEvents(game);
    game.commands.startRun();
    game.commands.pause();
    presses.length = 0;
    game.buttons.action.press('key:Space');
    game.tick();
    expect(game.state.mode).toBe('playing');
    expect(events).toContain('resume');
    game.tick();
    expect(presses).toEqual([false]);
  });

  it('ends the run when health reaches zero and ignores early restart taps', () => {
    const game = new Game({ systems: [] });
    const events = recordEvents(game);
    game.commands.startRun();
    game.state.health = 0;
    game.tick();
    expect(game.state.mode).toBe('gameover');
    expect(events).toContain('gameOver');
    tapAction(game);
    expect(game.state.mode).toBe('gameover');
    ticks(game, Math.ceil(GAMEOVER_INPUT_DELAY / TICK_DT));
    tapAction(game);
    expect(game.state.mode).toBe('playing');
    expect(game.state.health).toBe(MAX_HEALTH);
  });

  it('resets run values and reseeds the rng on every run', () => {
    const game = new Game({ systems: [] });
    game.seed(5);
    game.commands.startRun();
    const first = game.rng.next();
    game.state.score = 99;
    game.state.stars = 3;
    game.commands.gameOver();
    game.commands.startRun();
    expect(game.state.score).toBe(0);
    expect(game.state.stars).toBe(0);
    expect(game.state.seed).toBe(5);
    expect(game.rng.next()).toBe(first);
  });

  it('toggles mute with the mute key and emits mute', () => {
    const game = new Game({ systems: [] });
    const payloads: GameEvents['mute'][] = [];
    game.bus.on('mute', (p) => payloads.push(p));
    game.buttons.mute.press('key');
    game.tick();
    expect(game.state.muted).toBe(true);
    expect(payloads).toEqual([{ muted: true }]);
  });

  it('setZone updates the zone and emits zoneChanged', () => {
    const game = new Game({ systems: [] });
    const fn = vi.fn();
    game.bus.on('zoneChanged', fn);
    game.commands.setZone(1);
    expect(game.state.zoneIndex).toBe(1);
    expect(fn).toHaveBeenCalledWith({ index: 1, previous: 2 });
  });

  it('initialises systems once and renders layers back to front', () => {
    const calls: string[] = [];
    const layer = (name: string, l: RenderLayer) => () => void calls.push(`${name}:${l}`);
    const a: System = { name: 'a', init: () => void calls.push('init:a'), render: { ui: layer('a', 'ui'), world: layer('a', 'world') } };
    const b: System = { name: 'b', render: { background: layer('b', 'background'), ui: layer('b', 'ui') } };
    const game = new Game({ systems: [a, b] });
    game.render({} as CanvasRenderingContext2D, 0);
    expect(calls).toEqual(['init:a', 'b:background', 'a:world', 'a:ui', 'b:ui']);
  });

  it('renders at a scroll position extrapolated by alpha while playing', () => {
    const seen: { scroll: number; scrollLead: number; alpha: number }[] = [];
    const sys: System = { name: 'spy', render: { world: (r) => void seen.push({ scroll: r.scroll, scrollLead: r.scrollLead, alpha: r.alpha }) } };
    const game = new Game({ systems: [sys] });
    game.render({} as CanvasRenderingContext2D, 0.5);
    expect(seen[0]).toEqual({ scroll: 0, scrollLead: 0, alpha: 0.5 });
    game.commands.startRun();
    ticks(game, 10);
    const d = game.state.distance;
    game.render({} as CanvasRenderingContext2D, 0.5);
    expect(seen[1]!.scroll).toBeCloseTo(d + 0.5 * BASE_SPEED * TICK_DT, 6);
    expect(seen[1]!.scrollLead).toBeCloseTo(0.5 * BASE_SPEED * TICK_DT, 6);
    game.commands.pause();
    game.render({} as CanvasRenderingContext2D, 0.5);
    expect(seen[2]).toEqual({ scroll: d, scrollLead: 0, alpha: 0.5 });
  });

  it('reuses one render context per frame instead of allocating', () => {
    const contexts: RenderContext[] = [];
    const sys: System = { name: 'spy', render: { world: (r) => void contexts.push(r) } };
    const game = new Game({ systems: [sys] });
    game.render({} as CanvasRenderingContext2D, 0);
    game.render({} as CanvasRenderingContext2D, 0);
    expect(contexts[0]).toBe(contexts[1]);
  });

  it('useItem presses the use button for exactly one tick (for a ui item hotspot)', () => {
    const uses: { pressed: boolean; held: boolean; released: boolean }[] = [];
    const sys: System = { name: 'spy', update: (ctx) => void uses.push(ctx.input.use) };
    const game = new Game({ systems: [sys] });
    game.commands.startRun();
    game.ctx.addHotspot({ rect: () => ({ x: 0, y: 0, w: 10, h: 10 }), onPress: () => game.ctx.commands.useItem() });
    game.hitHotspot(5, 5);
    ticks(game, 2);
    expect(uses[0]).toMatchObject({ pressed: true, held: false, released: true });
    expect(uses[1]).toMatchObject({ pressed: false, held: false, released: false });
  });

  it('carries the item-use events and the ball entity kind on the bus', () => {
    const game = new Game({ systems: [] });
    const names = recordEvents(game);
    const ball: EntityKind = 'ball';
    game.bus.emit('itemUsed', { item: 'beer', action: 'drink' });
    game.bus.emit('drunkStart', { duration: 6 });
    game.bus.emit('healthGained', { health: 4 });
    game.bus.emit('ballThrown', { entityId: 1 });
    game.bus.emit('ballHit', { entityId: 2, kind: 'vfbFan' });
    game.bus.emit('ballBack', { entityId: 1 });
    game.bus.emit('crash', { entityId: 1, kind: ball, health: 3 });
    expect(names).toEqual(['itemUsed', 'drunkStart', 'healthGained', 'ballThrown', 'ballHit', 'ballBack', 'crash']);
  });

  it('routes pointer presses inside a hotspot to it instead of the action', () => {
    const game = new Game({ systems: [] });
    const onPress = vi.fn();
    game.ctx.addHotspot({ rect: () => ({ x: 10, y: 10, w: 20, h: 20 }), onPress });
    expect(game.hitHotspot(15, 15)).toBe(true);
    expect(onPress).toHaveBeenCalledOnce();
    expect(game.hitHotspot(50, 50)).toBe(false);
  });

  it('notifies user-gesture listeners until they unsubscribe', () => {
    const game = new Game({ systems: [] });
    const fn = vi.fn();
    const off = game.ctx.onUserGesture(fn);
    game.notifyUserGesture();
    off();
    game.notifyUserGesture();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('runs scheduled callbacks after the given number of ticks', () => {
    const game = new Game({ systems: [] });
    const fn = vi.fn();
    game.after(3, fn);
    ticks(game, 2);
    expect(fn).not.toHaveBeenCalled();
    game.tick();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('reports the design view size until the app sets the adaptive width', () => {
    const game = new Game({ systems: [] });
    expect(game.ctx.display.viewWidth).toBe(VIEW_W);
    expect(game.ctx.display.viewHeight).toBe(VIEW_H);
    game.display.viewWidth = 422;
    expect(game.ctx.display.viewWidth).toBe(422);
  });

  it('pins state.speed to the speed override around the system updates', () => {
    const seen: number[] = [];
    const difficulty: System = {
      name: 'difficulty',
      update: (ctx) => {
        seen.push(ctx.state.speed);
        if (ctx.speedOverride === null) ctx.state.speed = 100;
      },
    };
    const game = new Game({ systems: [difficulty] });
    game.commands.startRun();
    game.setSpeedOverride(200);
    expect(game.ctx.speedOverride).toBe(200);
    ticks(game, 60);
    expect(seen.every((v) => v === 200)).toBe(true);
    expect(game.state.distance).toBeCloseTo(200, 3);
    game.setSpeedOverride(null);
    game.tick();
    expect(game.ctx.speedOverride).toBeNull();
    expect(game.state.speed).toBe(100);
  });

  it('keeps the speed override across a new run', () => {
    const game = new Game({ systems: [] });
    game.setSpeedOverride(150);
    game.commands.startRun();
    expect(game.state.speed).toBe(150);
  });
});

describe('reloadForUpdate command', () => {
  it('reloads the page through the platform', () => {
    const reload = vi.fn();
    const game = new Game({ systems: [], platform: { reload } });
    game.commands.reloadForUpdate();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('is a no-op without a browser platform', () => {
    const game = new Game({ systems: [] });
    expect(() => game.commands.reloadForUpdate()).not.toThrow();
  });
});

describe('changelog and install at startup', () => {
  it('fills whatsNew and install before the systems init', () => {
    const store = createMemoryStore();
    store.set(LAST_SEEN_VERSION_KEY, '2000-01-01.1');
    let seen: Pick<GameState, 'whatsNew' | 'install'> | null = null;
    const sys: System = { name: 'ui', init: (ctx) => void (seen = structuredClone({ whatsNew: ctx.state.whatsNew, install: ctx.state.install })) };
    new Game({
      systems: [sys],
      store,
      platform: { installEnvironment: () => ({ standalone: true, platform: 'ios' }) },
    });
    expect(seen!.whatsNew[0]?.version).toBe(BUILD_VERSION);
    expect(seen!.install).toMatchObject({ standalone: true, platform: 'ios', visits: 1 });
  });

  it('shows nothing new and stores the build on a first visit', () => {
    const store = createMemoryStore();
    const game = new Game({ systems: [], store });
    expect(game.state.whatsNew).toEqual([]);
    expect(store.get(LAST_SEEN_VERSION_KEY, null)).toBe(BUILD_VERSION);
  });

  it('markVersionSeen persists the build and empties whatsNew', () => {
    const store = createMemoryStore();
    store.set(LAST_SEEN_VERSION_KEY, '2000-01-01.1');
    const game = new Game({ systems: [], store });
    game.commands.markVersionSeen();
    expect(game.state.whatsNew).toEqual([]);
    expect(store.get(LAST_SEEN_VERSION_KEY, null)).toBe(BUILD_VERSION);
  });

  it('promptInstall shows the captured browser prompt; dismissInstallHint persists', () => {
    const store = createMemoryStore();
    const game = new Game({ systems: [], store });
    const prompt = vi.fn(() => Promise.resolve());
    game.install.capturePrompt({ preventDefault: () => {}, prompt });
    expect(game.state.install.canPrompt).toBe(true);
    game.commands.promptInstall();
    expect(prompt).toHaveBeenCalledOnce();
    expect(game.state.install.canPrompt).toBe(false);
    game.commands.dismissInstallHint();
    expect(game.state.install.dismissed).toBe(true);
    expect(store.get(INSTALL_HINT_DISMISSED_KEY, false)).toBe(true);
  });

  it('defaults to a non-persistent store and a plain browser', () => {
    const game = new Game({ systems: [] });
    expect(game.state.install).toMatchObject({ standalone: false, platform: 'other', canPrompt: false, visits: 1 });
  });
});
