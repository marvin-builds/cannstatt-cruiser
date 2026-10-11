import { describe, expect, it } from 'vitest';
import { rankedRows, splitSegments } from './split';

describe('splitSegments', () => {
  it('orders known keys, labels them and gives percentages summing to 100', () => {
    const segs = splitSegments(
      [
        { key: 'keys', count: 1 },
        { key: 'touch', count: 2 },
      ],
      [
        { key: 'touch', label: 'Touch' },
        { key: 'keys', label: 'Tastatur' },
      ],
    );
    expect(segs.map((s) => [s.label, s.count, s.percent])).toEqual([
      ['Touch', 2, 67],
      ['Tastatur', 1, 33],
    ]);
    expect(segs[0]!.fraction).toBeCloseTo(2 / 3);
  });
  it('keeps zero segments and uses largest remainders', () => {
    const segs = splitSegments(
      [
        { key: 'a', count: 1 },
        { key: 'b', count: 1 },
        { key: 'c', count: 1 },
      ],
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
        { key: 'd', label: 'D' },
      ],
    );
    expect(segs.map((s) => s.percent)).toEqual([34, 33, 33, 0]);
  });
  it('maps several keys onto one label and appends unknown keys as Andere', () => {
    const segs = splitSegments(
      [
        { key: 'true', count: 1 },
        { key: '1', count: 1 },
        { key: 'false', count: 2 },
        { key: 'weird', count: 4 },
      ],
      [
        { key: 'false', label: 'Erwachsene' },
        { key: 'true', label: 'Kinder', aliases: ['1'] },
      ],
    );
    expect(segs.map((s) => [s.label, s.count])).toEqual([
      ['Erwachsene', 2],
      ['Kinder', 2],
      ['Andere', 4],
    ]);
  });
  it('gives all zero without data', () => {
    const segs = splitSegments([], [{ key: 'a', label: 'A' }]);
    expect(segs).toEqual([{ key: 'a', label: 'A', count: 0, fraction: 0, percent: 0 }]);
  });
});

describe('rankedRows', () => {
  it('sorts by count, puts other last as Andere and scales bars to the largest', () => {
    const rows = rankedRows([
      { key: 'other', count: 50 },
      { key: 'Esslingen am Neckar', count: 10 },
      { key: 'Stuttgart', count: 40 },
    ]);
    expect(rows.map((r) => [r.label, r.count, r.share])).toEqual([
      ['Stuttgart', 40, 0.4],
      ['Esslingen am Neckar', 10, 0.1],
      ['Andere', 50, 0.5],
    ]);
    expect(rows.map((r) => r.bar)).toEqual([0.8, 0.2, 1]);
  });
  it('uses a label function for known keys', () => {
    const rows = rankedRows([{ key: 'DE', count: 1 }], (k) => (k === 'DE' ? 'Deutschland' : k));
    expect(rows[0]!.label).toBe('Deutschland');
  });
  it('is empty without entries', () => {
    expect(rankedRows([])).toEqual([]);
  });
});
