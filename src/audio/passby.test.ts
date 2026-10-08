import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../types';
import { PASS_BY, PASS_CUES, PassBy } from './passby';

type Vehicle = GameEvents['vehiclePassed'];
const vehicle = (kind: Vehicle['kind'], front = true, light = true): Vehicle => ({ kind, front, light });

describe('pass-by: which sound', () => {
  it.each([
    ['car', 'passCar'],
    ['van', 'passVan'],
    ['bus', 'passBus'],
    ['truck', 'passTruck'],
  ] as const)('a %s plays %s', (kind, cue) => {
    expect(new PassBy().pass(vehicle(kind), 0)?.cue).toBe(cue);
  });

  it('lists every pass-by cue', () => {
    expect([...PASS_CUES].sort()).toEqual(['passBus', 'passCar', 'passTruck', 'passVan']);
  });

  it('is louder in the front lane than in the back lane', () => {
    const front = new PassBy().pass(vehicle('car', true), 0)!.intensity;
    const back = new PassBy().pass(vehicle('car', false), 0)!.intensity;
    expect(front).toBeGreaterThan(back);
    expect(back).toBeGreaterThan(0.3);
  });

  it('is the main sound in light traffic, but subtle in dense Mitte traffic', () => {
    const light = new PassBy().pass(vehicle('van', true, true), 0)!.intensity;
    const dense = new PassBy().pass(vehicle('van', true, false), 0)!.intensity;
    expect(light).toBeGreaterThanOrEqual(0.9);
    expect(dense).toBeLessThanOrEqual(light * 0.5);
    expect(dense).toBeGreaterThan(0);
  });
});

describe('pass-by: rate limiting', () => {
  /** Vehicles passing every `gap` seconds for `seconds`; returns how many sounded. */
  function stream(passBy: PassBy, light: boolean, gap: number, seconds: number, start = 0): number {
    let heard = 0;
    for (let t = start; t < start + seconds; t += gap) if (passBy.pass(vehicle('car', true, light), t)) heard++;
    return heard;
  }

  it('lets every vehicle of light traffic be heard', () => {
    expect(stream(new PassBy(), true, 0.5, 10)).toBe(20);
  });

  it('thins out dense traffic so it does not stack into noise', () => {
    const heard = stream(new PassBy(), false, 0.2, 10);
    expect(heard).toBeGreaterThan(0);
    expect(heard).toBeLessThanOrEqual(Math.ceil(10 / PASS_BY.denseGap));
  });

  it('never plays two pass-bys at the same moment (two lanes crossing together)', () => {
    const passBy = new PassBy();
    expect(passBy.pass(vehicle('car', true), 3)).not.toBeNull();
    expect(passBy.pass(vehicle('bus', false), 3)).toBeNull();
    expect(passBy.pass(vehicle('bus', false), 3 + PASS_BY.lightGap)).not.toBeNull();
  });

  it('starts fresh in a new run (run time back at 0)', () => {
    const passBy = new PassBy();
    passBy.pass(vehicle('car', true, false), 50);
    passBy.reset();
    expect(passBy.pass(vehicle('car', true, false), 0.1)).not.toBeNull();
  });

  it('reuses one result object (no allocation per vehicle)', () => {
    const passBy = new PassBy();
    const first = passBy.pass(vehicle('car'), 0);
    expect(passBy.pass(vehicle('truck'), 1)).toBe(first);
  });
});
