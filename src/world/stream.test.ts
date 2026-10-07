import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { type Placement, PropStream, type StreamConfig } from './stream';

const WIDTHS: Record<string, number> = { tower: 40, hill: 60, house: 20, tree: 10, lamp: 4 };
const CONFIG: StreamConfig = {
  intro: ['tower', 'hill'],
  landmarks: ['tower', 'hill'],
  fillers: ['house', 'tree', 'lamp'],
  gap: [2, 12],
  fillersBetween: [1, 3],
};

function make(seed: number, config = CONFIG): PropStream {
  return new PropStream(config, (id) => WIDTHS[id]!, new Rng(seed));
}

function sequence(stream: PropStream, until: number): Placement[] {
  return stream.visible(0, until);
}

describe('PropStream', () => {
  it('starts with the intro props at the restart position', () => {
    const stream = make(1);
    stream.restart(30);
    const [first, second] = sequence(stream, 200);
    expect(first).toMatchObject({ id: 'tower', x: 30 });
    expect(second!.id).toBe('hill');
    expect(second!.x).toBeGreaterThanOrEqual(30 + 40 + 2);
  });

  it('places props left to right without overlap, gaps within range', () => {
    const stream = make(2);
    stream.restart(0);
    const list = sequence(stream, 5000);
    for (let i = 1; i < list.length; i++) {
      const gap = list[i]!.x - (list[i - 1]!.x + WIDTHS[list[i - 1]!.id]!);
      expect(gap).toBeGreaterThanOrEqual(2);
      expect(gap).toBeLessThanOrEqual(12);
      expect(Number.isInteger(list[i]!.x)).toBe(true);
    }
  });

  it('spaces landmarks with fillers and never repeats one back to back', () => {
    const stream = make(3);
    stream.restart(0);
    const ids = sequence(stream, 20000).map((p) => p.id);
    const landmarks = ids.map((id, i) => ({ id, i })).filter((p) => CONFIG.landmarks.includes(p.id));
    for (let k = 1; k < landmarks.length; k++) {
      expect(landmarks[k]!.id).not.toBe(landmarks[k - 1]!.id);
      if (k >= 2) {
        const fillers = landmarks[k]!.i - landmarks[k - 1]!.i - 1;
        expect(fillers).toBeGreaterThanOrEqual(1);
        expect(fillers).toBeLessThanOrEqual(3);
      }
    }
    expect(landmarks.length).toBeGreaterThan(10);
  });

  it('is deterministic per seed and varies between seeds', () => {
    const ids = (seed: number) => {
      const s = make(seed);
      s.restart(0);
      return sequence(s, 3000).map((p) => `${p.id}@${p.x}`).join(',');
    };
    expect(ids(5)).toBe(ids(5));
    expect(ids(5)).not.toBe(ids(6));
  });

  it('returns only props overlapping the window and forgets passed ones', () => {
    const stream = make(4);
    stream.restart(0);
    const all = stream.visible(0, 3000);
    const later = stream.visible(1000, 1400);
    expect(later.length).toBeGreaterThan(0);
    for (const p of later) {
      expect(p.x + WIDTHS[p.id]!).toBeGreaterThan(1000);
      expect(p.x).toBeLessThan(1400);
      expect(all).toContainEqual(p);
    }
  });

  it('does not depend on how far ahead it was asked (view width)', () => {
    const narrow = make(9);
    const wide = make(9);
    narrow.restart(0);
    wide.restart(0);
    const a: Placement[] = [];
    const b: Placement[] = [];
    for (let s = 0; s < 4000; s += 7) {
      a.push(...narrow.visible(s, s + 320));
      b.push(...wide.visible(s, s + 427));
    }
    const key = (list: Placement[]) => [...new Set(list.map((p) => `${p.id}@${p.x}`))].slice(0, 30).join();
    expect(key(a)).toBe(key(b));
  });

  it('works with only fillers', () => {
    const stream = make(1, { ...CONFIG, intro: [], landmarks: [] });
    stream.restart(0);
    expect(sequence(stream, 500).every((p) => CONFIG.fillers.includes(p.id))).toBe(true);
  });
});
