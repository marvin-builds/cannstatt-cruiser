import { describe, expect, it } from 'vitest';
import type { ObstacleKind } from '../types';
import { artSize, chillPickupArt, jointSize, starSize } from './art';
import { JOINT_H, JOINT_W, KICKER, OBSTACLES, STAR_SIZE } from './catalogue';
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
