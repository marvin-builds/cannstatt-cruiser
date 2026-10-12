import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Game } from '../core/game';
import { createPlayerTestGame, tick } from '../player/testing';
import type { Entity } from '../types';
import { starRect } from './catalogue';
import type { Piece } from './course';
import { createGameplaySystem } from './index';
import { asArc, linkArcs, STAR_ARC_BONUS, STAR_POINTS } from './star-arcs';
import { place, quietGame, record } from './test-kit';

/** Riding height: a grounded skater rides through stars centred here. */
const RIDE_Y = GROUND_Y - 15;

/** `n` stars in a row ahead of the skater at riding height, one arc of `size` (absent: no arc). */
function starRow(game: Game, n: number, size?: number, arc = 1): Entity[] {
  return Array.from({ length: n }, (_, i) => {
    const star = place(game, 'star', starRect(PLAYER_X + 12 + i * 13, RIDE_Y));
    if (size !== undefined) star.data = { arc, arcSize: size };
    return star;
  });
}

describe('star points (ROADMAP 65)', () => {
  it('every star scores STAR_POINTS times the multiplier and leaves combo and multiplier as they were', () => {
    const game = quietGame();
    game.state.combo = 3;
    game.state.multiplier = 3;
    starRow(game, 1);
    tick(game, 20);
    expect(game.state.stars).toBe(1);
    expect(game.state.score).toBe(STAR_POINTS * 3);
    expect(game.state.combo).toBe(3);
    expect(game.state.multiplier).toBe(3);
  });

  it('starts no combo: a star at multiplier 1 scores STAR_POINTS and the combo stays 0', () => {
    const game = quietGame();
    starRow(game, 2);
    tick(game, 40);
    expect(game.state.score).toBe(2 * STAR_POINTS);
    expect(game.state.combo).toBe(0);
    expect(game.state.multiplier).toBe(1);
  });

  it('a fully collected arc adds STAR_ARC_BONUS times the multiplier exactly once, right after its last star', () => {
    const game = quietGame();
    game.state.combo = 2;
    game.state.multiplier = 2;
    const scores = record(game, 'scoreChanged');
    starRow(game, 3, 3);
    tick(game, 60);
    expect(scores.map((s) => s.delta)).toEqual([20, 20, 20, STAR_ARC_BONUS * 2]);
    expect(game.state.score).toBe(3 * STAR_POINTS * 2 + STAR_ARC_BONUS * 2);
  });

  it('emits starArc once per complete arc with the bonus added, right after the bonus scoreChanged', () => {
    const game = quietGame();
    game.state.combo = 2;
    game.state.multiplier = 2;
    const log: string[] = [];
    game.bus.on('scoreChanged', (e) => log.push(`score ${e.delta}`));
    game.bus.on('starArc', (e) => log.push(`arc ${e.stars} ${e.points}`));
    starRow(game, 3, 3);
    tick(game, 60);
    expect(log).toEqual(['score 20', 'score 20', 'score 20', `score ${STAR_ARC_BONUS * 2}`, `arc 3 ${STAR_ARC_BONUS * 2}`]);
  });

  it('emits no starArc for a partly collected arc or a lone star', () => {
    const game = quietGame();
    const arcs = record(game, 'starArc');
    const [, , high] = starRow(game, 3, 3);
    high!.y = 10;
    const lone = starRow(game, 1, 1, 2);
    for (const s of lone) s.x += 60;
    tick(game, 90);
    expect(game.state.stars).toBe(3);
    expect(arcs).toEqual([]);
  });

  it('a partly collected arc gives no bonus (a star of it missed)', () => {
    const game = quietGame();
    const [, , high] = starRow(game, 3, 3);
    high!.y = 10;
    tick(game, 60);
    expect(game.state.stars).toBe(2);
    expect(game.state.score).toBe(2 * STAR_POINTS);
  });

  it('touching the street between two stars of an arc breaks it (one flight only)', () => {
    const game = quietGame();
    starRow(game, 3, 3);
    tick(game, 8);
    expect(game.state.stars).toBe(1);
    game.bus.emit('land', { impact: 0 });
    tick(game, 60);
    expect(game.state.stars).toBe(3);
    expect(game.state.score).toBe(3 * STAR_POINTS);
  });

  it('two arcs in a row each give their own bonus', () => {
    const game = quietGame();
    starRow(game, 2, 2, 1);
    const later = starRow(game, 2, 2, 2);
    for (const s of later) s.x += 40;
    tick(game, 90);
    expect(game.state.score).toBe(4 * STAR_POINTS + 2 * STAR_ARC_BONUS);
  });

  it('a lone star is no arc', () => {
    const game = quietGame();
    starRow(game, 1, 1);
    tick(game, 20);
    expect(game.state.score).toBe(STAR_POINTS);
  });

  it('kid mode scores stars and arcs the same', () => {
    const game = quietGame();
    game.state.kidMode = true;
    starRow(game, 3, 3);
    tick(game, 60);
    expect(game.state.score).toBe(3 * STAR_POINTS + STAR_ARC_BONUS);
  });

  it('a new run forgets an arc in progress', () => {
    const game = quietGame();
    starRow(game, 1, 2);
    tick(game, 8);
    expect(game.state.stars).toBe(1);
    game.commands.gameOver();
    game.commands.startRun();
    tick(game, 2);
    expect(game.state.score).toBe(0);
    starRow(game, 1, 2);
    tick(game, 20);
    expect(game.state.score).toBe(STAR_POINTS);
  });
});

describe('arc tags', () => {
  const star = (x: number): Piece => ({ kind: 'star', ...starRect(x, RIDE_Y) });
  const laid = (pieces: Piece[], firstId: number): Entity[] => pieces.map((p, i) => ({ ...p, id: firstId + i, done: false }));

  it('asArc names stars as one arc without touching the pieces it was given', () => {
    const pieces = [star(0), star(13)];
    const tagged = asArc(pieces, 'a');
    expect(tagged.map((p) => p.data?.arc)).toEqual(['a', 'a']);
    expect(pieces[0]!.data).toBeUndefined();
  });

  it('linkArcs gives each arc of a laid pattern a run-wide id (its first star) and its size', () => {
    const one = laid([...asArc([star(0), star(13), star(26)], 'a'), ...asArc([star(80), star(93)], 'b'), { kind: 'bin', x: 100, y: 0, w: 5, h: 5 }], 10);
    const two = laid(asArc([star(0), star(13)], 'a'), 20);
    const entities = [...one];
    linkArcs(entities, 0);
    entities.push(...two);
    linkArcs(entities, one.length);
    expect(entities.map((e) => e.data)).toEqual([
      { arc: 10, arcSize: 3 },
      { arc: 10, arcSize: 3 },
      { arc: 10, arcSize: 3 },
      { arc: 13, arcSize: 2 },
      { arc: 13, arcSize: 2 },
      undefined,
      { arc: 20, arcSize: 2 },
      { arc: 20, arcSize: 2 },
    ]);
  });

  it('every star the spawner lays belongs to an arc whose size matches its stars', () => {
    const game = createPlayerTestGame([createGameplaySystem()]);
    game.state.health = Number.MAX_SAFE_INTEGER;
    game.setSpeedOverride(150);
    const seen = new Map<number, Entity>();
    for (let t = 0; t < 60 * 120; t++) {
      tick(game, 1);
      for (const e of game.state.entities) if (e.kind === 'star') seen.set(e.id, { ...e });
    }
    const arcs = new Map<number, number>();
    for (const s of seen.values()) {
      expect(typeof s.data?.arc).toBe('number');
      arcs.set(s.data!.arc as number, (arcs.get(s.data!.arc as number) ?? 0) + 1);
    }
    expect(arcs.size).toBeGreaterThan(5);
    for (const s of seen.values()) expect(s.data!.arcSize).toBe(arcs.get(s.data!.arc as number));
  }, 120_000);
});
