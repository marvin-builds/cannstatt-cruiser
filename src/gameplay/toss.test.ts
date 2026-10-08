import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../core/config';
import { ItemToss, TOSS_TIME } from './toss';

const head = { x: 70, y: 124 };
const hands = { x: 66, y: 136 };

/** Flies the toss with `handsAt(tick)` as the moving target; returns the catch tick and the flight path. */
function fly(toss: ItemToss, handsAt: (tick: number) => { x: number; y: number }) {
  const path: { x: number; y: number }[] = [];
  for (let tick = 1; tick <= 120; tick++) {
    const caught = toss.update(handsAt(tick), TICK_DT);
    if (caught) return { tick, caught, path };
    if (!toss.flight) break;
    path.push({ ...toss.flight.at });
  }
  return { tick: -1, caught: null, path };
}

describe('item toss after a stomp', () => {
  it('pops up in an arc above the head and lands in the hands after ~0.4-0.5 s', () => {
    expect(TOSS_TIME).toBeGreaterThanOrEqual(0.4);
    expect(TOSS_TIME).toBeLessThanOrEqual(0.5);
    const toss = new ItemToss();
    toss.launch('football', head, hands);
    const { tick, caught, path } = fly(toss, () => hands);
    expect(caught).toBe('football');
    expect(tick).toBe(Math.round(TOSS_TIME / TICK_DT));
    expect(Math.min(...path.map((p) => p.y))).toBeLessThan(head.y - 6);
    expect(toss.flight).toBeNull();
  });

  const moves = {
    'jumps (hands go up 50 px)': (t: number) => ({ x: hands.x, y: hands.y - Math.min(50, t * 3) }),
    'ducks (hands drop 8 px)': (t: number) => ({ x: hands.x, y: hands.y + (t > 5 ? 8 : 0) }),
    'jumps and falls back': (t: number) => ({ x: hands.x, y: hands.y - 40 * Math.sin((Math.PI * t) / 27) }),
  };
  for (const [what, handsAt] of Object.entries(moves)) {
    it(`is always caught, also when the skater ${what} meanwhile: it homes in on the hands`, () => {
      const toss = new ItemToss();
      toss.launch('pretzel', head, hands);
      const { tick, caught, path } = fly(toss, handsAt);
      expect(caught).toBe('pretzel');
      const last = path[path.length - 1]!;
      const target = handsAt(tick - 1);
      expect(Math.hypot(last.x - target.x, last.y - target.y)).toBeLessThan(8);
    });
  }

  it('a Maßkrug spills a few foam drops in flight, the others do not', () => {
    const beer = new ItemToss();
    beer.launch('beer', head, hands);
    fly(beer, () => hands);
    expect(beer.drops.length).toBeGreaterThanOrEqual(3);
    const ball = new ItemToss();
    ball.launch('football', head, hands);
    fly(ball, () => hands);
    expect(ball.drops).toEqual([]);
  });

  it('foam drops fall and fade away', () => {
    const beer = new ItemToss();
    beer.launch('beer', head, hands);
    fly(beer, () => hands);
    for (let i = 0; i < 120; i++) beer.update(hands, TICK_DT);
    expect(beer.drops).toEqual([]);
  });

  it('cancel() loses the item in flight (crash), reset() clears everything', () => {
    const toss = new ItemToss();
    toss.launch('beer', head, hands);
    toss.update(hands, TICK_DT);
    toss.cancel();
    expect(fly(toss, () => hands).caught).toBeNull();
    toss.launch('beer', head, hands);
    for (let i = 0; i < 10; i++) toss.update(hands, TICK_DT);
    toss.reset();
    expect(toss.flight).toBeNull();
    expect(toss.drops).toEqual([]);
  });
});
