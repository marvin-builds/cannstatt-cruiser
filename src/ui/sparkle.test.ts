import { describe, expect, it } from 'vitest';
import { Sparkle, SPARKLE_RAYS, SPARKLE_TIME, sparkleDot } from './sparkle';

describe('kickflip sparkle burst', () => {
  it('shows for SPARKLE_TIME after start, a new start restarts it', () => {
    const s = new Sparkle();
    expect(s.visible).toBe(false);
    s.start();
    expect(s.visible).toBe(true);
    s.update(SPARKLE_TIME - 0.01);
    expect(s.visible).toBe(true);
    s.start();
    s.update(SPARKLE_TIME - 0.01);
    expect(s.visible).toBe(true);
    s.update(0.02);
    expect(s.visible).toBe(false);
  });

  it('its dots fly outwards around the skater, in every direction', () => {
    const out = { x: 0, y: 0 };
    const dist = (age: number, i: number) => {
      sparkleDot(i, age, out);
      return Math.hypot(out.x, out.y);
    };
    for (let i = 0; i < SPARKLE_RAYS; i++) expect(dist(0.9, i)).toBeGreaterThan(dist(0.1, i));
    const xs = new Set<number>();
    const ys = new Set<number>();
    for (let i = 0; i < SPARKLE_RAYS; i++) {
      sparkleDot(i, 0.5, out);
      xs.add(Math.sign(out.x));
      ys.add(Math.sign(out.y));
    }
    expect(xs.has(1) && xs.has(-1) && ys.has(1) && ys.has(-1)).toBe(true);
    sparkleDot(0, 0.5, out);
    expect(Number.isInteger(out.x) && Number.isInteger(out.y)).toBe(true);
  });
});
