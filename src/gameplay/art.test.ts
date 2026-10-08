import { describe, expect, it } from 'vitest';
import type { ObstacleKind } from '../types';
import { artSize, chillPickupArt, jointSize, starSize } from './art';
import { HIGH_FIVER, JOINT_H, JOINT_W, KICKER, OBSTACLES, STAR_SIZE } from './catalogue';
import { concreteKickerSize, highFiverPose, highFiverSize, SLAP_TICKS } from './park-art';
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

  it('the high fiver holds his hand up, slaps for SLAP_TICKS after the high five, then stands relaxed', () => {
    expect(highFiverPose(undefined, 100)).toBe('up');
    expect(highFiverPose(100, 100)).toBe('slap');
    expect(highFiverPose(100, 100 + SLAP_TICKS - 1)).toBe('slap');
    expect(highFiverPose(100, 100 + SLAP_TICKS)).toBe('cheer');
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
