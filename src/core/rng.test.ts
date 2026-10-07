import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    expect(new Rng(1).next()).not.toEqual(new Rng(2).next());
  });

  it('restarts the sequence when reseeded', () => {
    const r = new Rng(7);
    const first = r.next();
    r.next();
    r.seed(7);
    expect(r.next()).toBe(first);
  });

  it('keeps next() in [0, 1)', () => {
    const r = new Rng(3);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() stays within inclusive bounds and hits both ends', () => {
    const r = new Rng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(2, 4));
    expect([...seen].sort()).toEqual([2, 3, 4]);
  });

  it('range(), pick() and chance() are deterministic helpers', () => {
    const r = new Rng(11);
    const v = r.range(5, 6);
    expect(v).toBeGreaterThanOrEqual(5);
    expect(v).toBeLessThan(6);
    expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });
});
