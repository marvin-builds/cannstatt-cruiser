import { describe, expect, it } from 'vitest';
import { dayChart, niceMax } from './day-chart';

describe('niceMax', () => {
  it('rounds up to 1, 2, 5 steps', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(41)).toBe(50);
    expect(niceMax(500)).toBe(500);
  });
});

describe('dayChart', () => {
  const days = [
    { day: '2026-10-09', sessions: 10, runs: 20, entries: 1, newPlayers: 0, returningVisits: 0 },
    { day: '2026-10-10', sessions: 0, runs: 0, entries: 0, newPlayers: 0, returningVisits: 0 },
  ];
  const box = { width: 200, height: 100, padLeft: 0, padBottom: 0, padTop: 0, gap: 2 };

  it('splits the width into one slot per day with grouped bars', () => {
    const chart = dayChart(days, ['sessions', 'runs'], box);
    expect(chart.max).toBe(20);
    expect(chart.slots).toHaveLength(2);
    const [first, second] = chart.slots;
    expect(first!.x).toBe(0);
    expect(second!.x).toBe(100);
    expect(first!.bars.map((b) => b.series)).toEqual(['sessions', 'runs']);
    const [s, r] = first!.bars;
    expect(r!.height).toBe(100);
    expect(r!.y).toBe(0);
    expect(s!.height).toBe(50);
    expect(s!.y).toBe(50);
    expect(r!.x).toBeGreaterThan(s!.x);
    expect(s!.width).toBeGreaterThan(0);
  });

  it('places zero bars on the baseline with zero height', () => {
    const chart = dayChart(days, ['sessions'], box);
    const bar = chart.slots[1]!.bars[0]!;
    expect(bar.height).toBe(0);
    expect(bar.y).toBe(100);
  });

  it('respects padding and gives gridlines for the axis', () => {
    const chart = dayChart(days, ['runs'], { ...box, padLeft: 20, padTop: 10, padBottom: 10 });
    expect(chart.slots[0]!.x).toBe(20);
    expect(chart.baseline).toBe(90);
    expect(chart.ticks.map((t) => t.value)).toEqual([0, 10, 20]);
    expect(chart.ticks[2]!.y).toBe(10);
  });

  it('marks which days get a label so labels never crowd', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, sessions: 1, runs: 1, entries: 0, newPlayers: 0, returningVisits: 0 }));
    const chart = dayChart(many, ['sessions'], { ...box, width: 300 });
    const labelled = chart.slots.filter((s) => s.label);
    expect(labelled.length).toBeLessThanOrEqual(8);
    expect(chart.slots[29]!.label).toBe(true);
  });
});

describe('dayChart labels', () => {
  const box = { width: 200, height: 100, padLeft: 0, padBottom: 0, padTop: 0, gap: 2 };
  it('takes any periods and thins labels further on a narrow chart', () => {
    const many = Array.from({ length: 30 }, () => ({ sessions: 1, runs: 1, entries: 0, newPlayers: 0, returningVisits: 0 }));
    const narrow = dayChart(many, ['sessions'], { ...box, width: 150 });
    expect(narrow.slots.filter((s) => s.label).length).toBeLessThanOrEqual(3);
    expect(narrow.slots[29]!.item).toBe(many[29]);
  });
});
