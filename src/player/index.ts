/**
 * PLACEHOLDER owned by the player slice: a box with a variable-height jump.
 * Replace freely, keeping the factory name and the PlayerState contract.
 */
import { GRAVITY, GROUND_Y, HOLD_GRAVITY, JUMP_VELOCITY, MAX_JUMP_HOLD } from '../core/config';
import type { PlayerState, System } from '../types';

const BOX_W = 12;
const BOX_H = 28;

function updateHitbox(p: PlayerState): void {
  p.hitbox = { x: p.x - BOX_W / 2, y: p.y - BOX_H, w: BOX_W, h: BOX_H };
}

export function createPlayerSystem(): System {
  /** Seconds the current jump has been boosted by holding. */
  let boostTime = 0;
  let boosting = false;

  return {
    name: 'player',

    init(ctx) {
      ctx.bus.on('runStarted', () => {
        boostTime = 0;
        boosting = false;
      });
    },

    update(ctx, dt) {
      const { state, input, bus } = ctx;
      const p = state.player;
      if (state.mode !== 'playing') return;

      if (input.action.pressed && p.grounded) {
        p.vy = -JUMP_VELOCITY;
        p.grounded = false;
        boosting = true;
        boostTime = 0;
        bus.emit('jump', { velocity: JUMP_VELOCITY });
      }
      if (!input.action.held) boosting = false;

      if (!p.grounded) {
        const boosted = boosting && p.vy < 0 && boostTime < MAX_JUMP_HOLD;
        if (boosted) boostTime += dt;
        p.vy += (boosted ? HOLD_GRAVITY : GRAVITY) * dt;
        p.y += p.vy * dt;
        if (p.y >= GROUND_Y) {
          bus.emit('land', { impact: p.vy });
          p.y = GROUND_Y;
          p.vy = 0;
          p.grounded = true;
        }
      }
      p.state = p.grounded ? 'ride' : p.vy < 0 ? 'jump' : 'air';
      updateHitbox(p);
    },

    render: {
      player({ g, state }) {
        const p = state.player;
        const x = Math.round(p.x - BOX_W / 2);
        const y = Math.round(p.y - BOX_H);
        g.fillStyle = '#e8d6b0';
        g.fillRect(x, y, BOX_W, BOX_H - 4);
        g.fillStyle = '#5b5f6b';
        g.fillRect(x, y, BOX_W, 6);
        g.fillStyle = '#7a4a2a';
        g.fillRect(x - 5, y + BOX_H - 4, BOX_W + 10, 2);
        g.fillStyle = '#222';
        g.fillRect(x - 3, y + BOX_H - 2, 3, 2);
        g.fillRect(x + BOX_W, y + BOX_H - 2, 3, 2);
      },
    },
  };
}
