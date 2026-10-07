/**
 * PLACEHOLDER owned by the world slice: sky gradient, ground line and
 * scrolling ground marks. Replace with the parallax zones, keeping the factory name.
 */
import { GROUND_Y, VIEW_H, VIEW_W } from '../core/config';
import type { System } from '../types';

const ZONE_SKIES = [
  ['#5b8fd6', '#bcd8f2'],
  ['#4f7fc4', '#cfe3ef'],
  ['#d9875e', '#f6d6a8'],
] as const;

export function createWorldSystem(): System {
  return {
    name: 'world',

    init(ctx) {
      ctx.commands.setLetterboxColor('#2b2b33');
    },

    render: {
      background({ g, state }) {
        const [top, bottom] = ZONE_SKIES[state.zoneIndex % ZONE_SKIES.length]!;
        const sky = g.createLinearGradient(0, 0, 0, GROUND_Y);
        sky.addColorStop(0, top);
        sky.addColorStop(1, bottom);
        g.fillStyle = sky;
        g.fillRect(0, 0, VIEW_W, GROUND_Y);
      },
      world({ g, state }) {
        g.fillStyle = '#5a5a66';
        g.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
        g.fillStyle = '#d8d8e0';
        g.fillRect(0, GROUND_Y, VIEW_W, 1);
        g.fillStyle = '#44444f';
        const offset = Math.floor(state.distance) % 32;
        for (let x = -offset; x < VIEW_W; x += 32) g.fillRect(x, GROUND_Y + 8, 12, 2);
      },
    },
  };
}
