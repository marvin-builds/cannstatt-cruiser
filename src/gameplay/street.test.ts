import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../core/config';
import { HITBOX_H } from '../player/tuning';
import { kickerRect, ledgeRect, obstacleRect } from './catalogue';
import type { Piece } from './course';
import { isStreetThreat, quietStreetStars } from './street';

describe('quiet street stars (ROADMAP 52 quiet cap under stunt lines)', () => {
  const kicker: Piece = { kind: 'kicker', ...kickerRect(40) };
  const ledge = (x: number, w: number): Piece => ({ kind: 'ledge', ...ledgeRect(x, 50, w) });

  it('fills every stretch of street longer than `longest` px without a threat, at riding height', () => {
    // Upper-level ledges after a gap jump have nothing on the street below them.
    const pieces: Piece[] = [kicker, ledge(70, 120), ledge(230, 150), { kind: 'bench', ...obstacleRect('bench', 470) }];
    const stars = quietStreetStars(pieces, 120);
    expect(stars.length).toBeGreaterThan(0);
    const all = [...pieces, ...stars];
    const threats = all.filter((p) => isStreetThreat(p, all)).sort((a, b) => a.x - b.x);
    for (let i = 1; i < threats.length; i++) expect(threats[i]!.x - (threats[i - 1]!.x + threats[i - 1]!.w)).toBeLessThanOrEqual(120);
    for (const s of stars) {
      expect(s.kind).toBe('star');
      // Taken by riding through (standing or ducked), below any deck.
      expect(s.y + s.h).toBeLessThanOrEqual(GROUND_Y);
      expect(s.y).toBeGreaterThanOrEqual(GROUND_Y - HITBOX_H.ducking);
    }
  });

  it('does not trust a star touching a ledge end: on the live street (float x) it may count as upper level', () => {
    const edge: Piece = { kind: 'star', x: 190, y: 60, w: 9, h: 9 };
    const pieces: Piece[] = [kicker, ledge(70, 120), edge, { kind: 'bench', ...obstacleRect('bench', 300) }];
    // Kicker end 58 to the bench at 300: 242 px; split by the edge star at 190 it would be 132 + 101.
    expect(quietStreetStars(pieces, 150).length).toBeGreaterThan(0);
  });

  it('adds nothing where the street never goes quiet that long', () => {
    const pieces: Piece[] = [kicker, ledge(70, 60), { kind: 'bin', ...obstacleRect('bin', 150) }];
    expect(quietStreetStars(pieces, 120)).toEqual([]);
  });
});
