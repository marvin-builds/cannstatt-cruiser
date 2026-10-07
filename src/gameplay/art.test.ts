import { describe, expect, it } from 'vitest';
import type { ObstacleKind } from '../types';
import { artSize, jointSize, starSize } from './art';
import { JOINT_H, JOINT_W, OBSTACLES, STAR_SIZE } from './catalogue';

describe('obstacle art', () => {
  it('matches the catalogue sizes the collision and solver use', () => {
    for (const kind of Object.keys(OBSTACLES) as ObstacleKind[]) {
      const { w, h } = OBSTACLES[kind];
      expect(artSize(kind), kind).toEqual({ w, h });
    }
    expect(starSize()).toEqual({ w: STAR_SIZE, h: STAR_SIZE });
    expect(jointSize()).toEqual({ w: JOINT_W, h: JOINT_H });
  });
});
