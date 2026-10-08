import { describe, expect, it } from 'vitest';
import { CrowdCheer, crowdBottles } from './crowd';

describe('crowd bottles', () => {
  it('hands beer around only for adults: kid mode switches every bottle to lemonade', () => {
    const adult = crowdBottles(false);
    const kid = crowdBottles(true);
    expect(adult.some((b) => b.kind === 'beer')).toBe(true);
    expect(kid.length).toBeGreaterThan(0);
    expect(kid.every((b) => b.kind === 'lemonade')).toBe(true);
  });

  it('gives lemonade colourful drinks that share no colour with the beer look', () => {
    const beerColours = new Set(
      crowdBottles(false)
        .filter((b) => b.kind === 'beer')
        .flatMap((b) => [b.glass, b.drink, b.label]),
    );
    const kid = crowdBottles(true);
    expect(new Set(kid.map((b) => b.drink)).size).toBeGreaterThan(1);
    for (const b of kid) for (const c of [b.glass, b.drink, b.label]) expect(beerColours.has(c)).toBe(false);
  });
});

/** Share of sampled moments (over `seconds`) in which person `who` has the arms up. */
function upShare(crowd: CrowdCheer, seconds: number, who = 0): number {
  let up = 0;
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    crowd.update(1 / 60);
    if (crowd.armsUp(who)) up++;
  }
  return up / steps;
}

describe('CrowdCheer', () => {
  it('stays calm without tricks', () => {
    const crowd = new CrowdCheer();
    expect(upShare(crowd, 5)).toBe(0);
  });

  it('raises arms more the louder the session cheers', () => {
    const quiet = new CrowdCheer();
    const loud = new CrowdCheer();
    quiet.cheer(0.2);
    loud.cheer(1);
    const q = upShare(quiet, 1, 1);
    const l = upShare(loud, 1, 1);
    expect(q).toBeGreaterThan(0);
    expect(l).toBeGreaterThan(q);
  });

  it('calms down after a cheer and cheers a moment longer after the session ends', () => {
    const cheer = new CrowdCheer();
    const end = new CrowdCheer();
    cheer.cheer(0.6);
    end.sessionEnd(0.6);
    upShare(cheer, 3);
    upShare(end, 3);
    expect(cheer.intensity).toBe(0);
    expect(end.intensity).toBeGreaterThan(0);
    upShare(end, 6);
    expect(end.intensity).toBe(0);
  });

  it('starts calm again after reset', () => {
    const crowd = new CrowdCheer();
    crowd.cheer(1);
    crowd.reset();
    expect(crowd.intensity).toBe(0);
  });
});
