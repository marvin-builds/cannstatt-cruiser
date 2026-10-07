import { describe, expect, it, vi } from 'vitest';
import type { GameEvents, RenderLayer, System } from '../types';
import { BASE_SPEED, GAMEOVER_INPUT_DELAY, MAX_HEALTH, TICK_DT } from './config';
import { Game } from './game';

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
    game.commands.setZone(2);
    expect(game.state.zoneIndex).toBe(2);
    expect(fn).toHaveBeenCalledWith({ index: 2, previous: 0 });
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
});
