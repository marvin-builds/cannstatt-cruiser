import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../core/config';
import { HIGH_FIVE_HOLD, HIGH_FIVE_RAISE } from '../player/high-five';
import type { ObstacleKind } from '../types';
import { artSize, chillPickupArt, jointSize, starSize } from './art';
import { HIGH_FIVER, JOINT_H, JOINT_W, KICKER, OBSTACLES, STAR_SIZE } from './catalogue';
import { concreteKickerSize, HOP_HEIGHT, highFiverReaction, highFiverSize, PULL_TICKS, PUMP_TICKS, REACTION_TICKS, SLAP_TICKS } from './park-art';
import { kickerArtSize } from './stunt-art';

describe('obstacle art', () => {
  it('matches the catalogue sizes the collision and solver use', () => {
    for (const kind of Object.keys(OBSTACLES) as ObstacleKind[]) {
      const { w, h } = OBSTACLES[kind];
      expect(artSize(kind), kind).toEqual({ w, h });
    }
    expect(starSize()).toEqual({ w: STAR_SIZE, h: STAR_SIZE });
    expect(jointSize()).toEqual({ w: JOINT_W, h: JOINT_H });
    expect(kickerArtSize()).toEqual({ w: KICKER.w, h: KICKER.h });
    expect(concreteKickerSize()).toEqual({ w: KICKER.w, h: KICKER.h });
    expect(highFiverSize()).toEqual({ w: HIGH_FIVER.w, h: HIGH_FIVER.h });
  });

  it('the high fiver holds his hand up, slaps, pulls the hand back, fist-pumps with a hop, then stands relaxed', () => {
    const at = (age: number) => highFiverReaction(100, 100 + age);
    expect(highFiverReaction(undefined, 100)).toEqual({ pose: 'up', lift: 0 });
    expect(at(0)).toEqual({ pose: 'slap', lift: 0 });
    expect(at(SLAP_TICKS - 1).pose).toBe('slap');
    expect(at(SLAP_TICKS).pose).toBe('pull');
    expect(at(SLAP_TICKS + PULL_TICKS - 1).pose).toBe('pull');
    expect(at(SLAP_TICKS + PULL_TICKS).pose).toBe('pump');
    expect(at(REACTION_TICKS - 1).pose).toBe('pump');
    expect(REACTION_TICKS).toBe(SLAP_TICKS + PULL_TICKS + PUMP_TICKS);
    expect(at(REACTION_TICKS)).toEqual({ pose: 'cheer', lift: 0 });
    expect(at(1000)).toEqual({ pose: 'cheer', lift: 0 });
  });

  it('keeps his hand up in the slap until the skater’s palm leaves the contact', () => {
    expect(SLAP_TICKS).toBeGreaterThanOrEqual(Math.round((HIGH_FIVE_RAISE + HIGH_FIVE_HOLD) * TICK_RATE));
  });

  it('hops only while fist-pumping: integer px up to HOP_HEIGHT, up and back down without jitter', () => {
    const lifts = Array.from({ length: REACTION_TICKS }, (_, age) => highFiverReaction(100, 100 + age));
    for (const r of lifts) {
      expect(Number.isInteger(r.lift)).toBe(true);
      expect(r.lift).toBeGreaterThanOrEqual(0);
      if (r.pose !== 'pump') expect(r.lift).toBe(0);
    }
    const hop = lifts.map((r) => r.lift);
    expect(Math.max(...hop)).toBe(HOP_HEIGHT);
    const peak = hop.indexOf(HOP_HEIGHT);
    for (let i = 1; i <= peak; i++) expect(hop[i]!).toBeGreaterThanOrEqual(hop[i - 1]!);
    for (let i = peak + 1; i < hop.length; i++) expect(hop[i]!).toBeLessThanOrEqual(hop[i - 1]!);
    expect(hop[hop.length - 1]).toBe(0);
  });

  it('draws the chill pickup as a joint for adults and as a bubble gum of the same size in kid mode', () => {
    const adult = chillPickupArt(false);
    const kid = chillPickupArt(true);
    expect(adult.name).toBe('joint');
    expect(kid.name).toBe('gum');
    expect({ w: kid.sprite.width, h: kid.sprite.height }).toEqual({ w: JOINT_W, h: JOINT_H });
    expect(kid.sprite).not.toBe(adult.sprite);
  });
});
