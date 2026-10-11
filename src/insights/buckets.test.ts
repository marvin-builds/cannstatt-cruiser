import { describe, expect, it } from 'vitest';
import { distanceGroups, regroup, runLengthGroups, scoreGroups } from './buckets';

describe('regroup', () => {
  it('sums lower-bound keys into the given groups, zero-filled and in order', () => {
    const groups = regroup(
      [
        { key: '0', count: 2 },
        { key: '20', count: 3 },
        { key: '50', count: 1 },
        { key: '700', count: 4 },
      ],
      [
        { from: 0, label: 'a' },
        { from: 30, label: 'b' },
        { from: 100, label: 'c' },
        { from: 600, label: 'd' },
      ],
    );
    expect(groups).toEqual([
      { key: 'a', count: 5 },
      { key: 'b', count: 1 },
      { key: 'c', count: 0 },
      { key: 'd', count: 4 },
    ]);
  });
  it('ignores keys that are not numbers', () => {
    expect(regroup([{ key: 'x', count: 9 }], [{ from: 0, label: 'a' }])).toEqual([{ key: 'a', count: 0 }]);
  });
});

describe('board groups', () => {
  it('labels run lengths', () => {
    const seconds = runLengthGroups([
      { key: '10', count: 1 },
      { key: '30', count: 2 },
      { key: '60', count: 3 },
      { key: '180', count: 4 },
      { key: '600', count: 5 },
      { key: '3600', count: 6 },
    ]);
    expect(seconds).toEqual([
      { key: '<30 s', count: 1 },
      { key: '30-60 s', count: 2 },
      { key: '1-3 min', count: 3 },
      { key: '3-10 min', count: 4 },
      { key: '10+ min', count: 11 },
    ]);
  });
  it('labels distances', () => {
    expect(distanceGroups([{ key: '5000', count: 1 }, { key: '100', count: 2 }]).map((g) => g.key)).toEqual([
      '<200 m',
      '200-500 m',
      '0,5-1 km',
      '1-2 km',
      '2+ km',
    ]);
    expect(distanceGroups([{ key: '5000', count: 1 }, { key: '100', count: 2 }]).map((g) => g.count)).toEqual([2, 0, 0, 0, 1]);
  });
  it('labels score buckets with German grouping', () => {
    expect(scoreGroups([{ key: '2000', count: 7 }])).toEqual([
      { key: '<100', count: 0 },
      { key: '100-500', count: 0 },
      { key: '500-2.000', count: 0 },
      { key: '2.000-5.000', count: 7 },
      { key: '5.000+', count: 0 },
    ]);
  });
});
