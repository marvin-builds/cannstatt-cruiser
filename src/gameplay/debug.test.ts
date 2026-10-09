import { afterEach, describe, expect, it, vi } from 'vitest';
import { GROUND_Y, PLAYER_X, VIEW_MAX_W } from '../core/config';
import { tick } from '../player/testing';
import { KICKER } from './catalogue';
import { installGameplayDebug } from './debug';
import { DroppedItems } from './drop';
import { StuntLines } from './stunts';
import { quietGame, record } from './test-kit';

describe('gameplay debug hook (window.__gameplay)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the dropped items read-only: item, box and whether it lies on the street', () => {
    vi.stubGlobal('window', {});
    const drops = new DroppedItems();
    installGameplayDebug(quietGame().ctx, drops, new StuntLines());
    expect(window.__gameplay!.drops()).toEqual([]);

    drops.drop('pretzel', { x: 200, y: GROUND_Y - 20 }, 120, () => true);
    const [seen] = window.__gameplay!.drops();
    const d = drops.items[0]!;
    expect(seen).toEqual({ item: 'pretzel', x: d.x, y: d.y, w: d.w, h: d.h, lying: false });

    // A snapshot: changing it leaves the game alone.
    seen!.x = -999;
    expect(drops.items[0]!.x).toBe(d.x);
  });

  it('places a kicker and a ledge (its y is the grind surface) that form one line, and a whole designed line', () => {
    vi.stubGlobal('window', {});
    const game = quietGame(120);
    installGameplayDebug(game.ctx, new DroppedItems(), new StuntLines());
    const hook = window.__gameplay!;
    const k = hook.place('kicker', 200);
    const l = hook.place('ledge', 260);
    const [ke, le] = [k, l].map((id) => game.state.entities.find((e) => e.id === id)!);
    expect(ke).toMatchObject({ kind: 'kicker', x: 200, y: GROUND_Y - KICKER.h });
    expect(le!.kind).toBe('ledge');
    expect(GROUND_Y - le!.y).toBeGreaterThanOrEqual(40);
    expect(le!.data).toMatchObject({ line: ke!.data!.line, step: 2, steps: 2, zone: game.state.zoneIndex });
    expect(ke!.data).toMatchObject({ step: 1, steps: 2 });

    hook.clear();
    const ids = hook.stuntLine(PLAYER_X + 40);
    const pieces = game.state.entities.filter((e) => ids.includes(e.id) && (e.kind === 'kicker' || e.kind === 'ledge'));
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    expect(pieces[0]!.x).toBe(PLAYER_X + 40);
  });

  it('shows the running stunt line read-only', () => {
    vi.stubGlobal('window', {});
    const game = quietGame(120);
    const lines = new StuntLines();
    installGameplayDebug(game.ctx, new DroppedItems(), lines);
    const launches = record(game, 'launch');
    expect(window.__gameplay!.stunts()).toBeNull();
    window.__gameplay!.place('kicker', PLAYER_X + 20);
    for (let i = 0; i < 100 && launches.length === 0; i++) tick(game);
    lines.made(game.ctx, game.state.entities.find((e) => e.id === launches[0]!.entityId)!);
    expect(window.__gameplay!.stunts()).toMatchObject({ steps: 2, made: 1, multiplier: 1 });
  });

  it('plans a NorDIY park right ahead: state.park and its pieces 1:1 at screen x PLAYER_X + d - distance, the street there cleared', () => {
    vi.stubGlobal('window', {});
    const game = quietGame(120);
    installGameplayDebug(game.ctx, new DroppedItems(), new StuntLines());
    const hook = window.__gameplay!;
    expect(hook.parkPlan()).toBeNull();
    hook.place('bin', VIEW_MAX_W + 100);
    const plan = hook.park();
    const { distance } = game.state;
    expect(game.state.park).toBe(plan);
    expect(hook.parkPlan()).toBe(plan);
    expect(PLAYER_X + plan.start - distance).toBe(VIEW_MAX_W + 16);
    expect(game.state.entities.some((e) => e.kind === 'bin')).toBe(false);
    expect(game.state.entities.filter((e) => e.kind === 'highFiver').length).toBe(1);
    const structures = game.state.entities.filter((e) => e.data?.park !== undefined).sort((a, b) => a.x - b.x);
    const at = (d: number) => Math.round(d * 1000) / 1000;
    expect(structures.map((e) => [e.data!.park, at(e.x - PLAYER_X + distance), GROUND_Y - e.y])).toEqual(plan.pieces.map((p) => [p.kind, at(p.from), p.height]));
    // Planning again replaces the park.
    const near = hook.park(100);
    expect(near.start).toBe(game.state.distance + 100);
    expect(game.state.entities.filter((e) => e.kind === 'highFiver').length).toBe(1);
  });

  it('places a named spawn pattern (a combo) with its origin at screen x, reserving its street from the spawner', () => {
    vi.stubGlobal('window', {});
    const game = quietGame(140);
    const reserved: [number, number][] = [];
    installGameplayDebug(game.ctx, new DroppedItems(), new StuntLines(), (start, end) => reserved.push([start, end]));
    const hook = window.__gameplay!;
    hook.place('bin', PLAYER_X + 120);
    const ids = hook.pattern('railBenchRail');
    const placed = game.state.entities.filter((e) => ids.includes(e.id));
    expect(game.state.entities.some((e) => e.kind === 'bin')).toBe(false);
    expect(placed.filter((e) => e.kind === 'handrail').length).toBe(2);
    expect(placed.filter((e) => e.kind === 'bench').length).toBe(1);
    expect(placed.some((e) => e.kind === 'star')).toBe(true);
    expect(Math.min(...placed.map((e) => e.x))).toBeGreaterThan(PLAYER_X);
    expect(reserved).toHaveLength(1);
    expect(reserved[0]![0]).toBe(game.state.distance);
    expect(() => hook.pattern('nope')).toThrow();
  });
});
