import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import type { GameEvents } from '../types';
import { B, BODY_FRAMES, CHILL_BODY_FRAMES, HEAD_AT } from './art';
import { chillJoint, SMOKE_PERIOD, smokePuffs } from './chill';
import { poseAt, TIMELINES, type TimelineName } from './poses';
import { SkaterController } from './controller';
import { createPlayerTestGame, jumpApex, tick } from './testing';
import { CHILL_ANIM_RATE, CHILL_JUMP_SCALE, JUMP_VELOCITY, PUSH_TIME } from './tuning';

function chilled(seconds = 30): Game {
  const game = createPlayerTestGame();
  game.state.chillTimer = seconds;
  return game;
}

function jumps(game: Game): GameEvents['jump'][] {
  const seen: GameEvents['jump'][] = [];
  game.bus.on('jump', (e) => seen.push(e));
  return seen;
}

describe('chill jump (state.chillTimer > 0)', () => {
  it('takes off with JUMP_VELOCITY * CHILL_JUMP_SCALE', () => {
    const game = chilled();
    const seen = jumps(game);
    game.buttons.action.press('test');
    tick(game);
    expect(seen[0]!.velocity).toBeCloseTo(JUMP_VELOCITY * CHILL_JUMP_SCALE);
    expect(game.state.player.vy).toBeLessThan(0);
    expect(game.state.player.vy).toBeGreaterThan(-JUMP_VELOCITY * CHILL_JUMP_SCALE);
  });

  it('lowers both the tap and the full-hold apex', () => {
    const tap = jumpApex(createPlayerTestGame(), 2);
    const hold = jumpApex(createPlayerTestGame(), 60);
    const chillTap = jumpApex(chilled(), 2);
    const chillHold = jumpApex(chilled(), 60);
    expect(chillTap).toBeLessThan(tap * 0.8);
    expect(chillHold).toBeLessThan(hold * 0.85);
    expect(chillHold).toBeGreaterThan(hold * 0.5);
  });

  it('only changes the take-off velocity (same hold window and gravity)', () => {
    // A full hold of a scaled jump equals the closed-form: hold gravity for MAX_JUMP_HOLD, then normal gravity.
    const a = jumpApex(chilled(), 30);
    const b = jumpApex(chilled(), 120);
    expect(a).toBe(b);
  });

  it('reads the timer as it stands when the player updates (before gameplay counts it down)', () => {
    // Expiry tick: gameplay (after the player) will drop the timer to 0 this tick; the take-off is still scaled.
    const expiring = chilled(TICK_DT / 2);
    const seen = jumps(expiring);
    expiring.buttons.action.press('test');
    tick(expiring);
    expect(seen[0]!.velocity).toBeCloseTo(JUMP_VELOCITY * CHILL_JUMP_SCALE);
    // Pickup tick: gameplay sets the timer only after the player ran, so this take-off is normal.
    const picking = createPlayerTestGame();
    const seenPick = jumps(picking);
    picking.bus.on('jump', () => (picking.state.chillTimer = 6));
    picking.buttons.action.press('test');
    tick(picking);
    expect(seenPick[0]!.velocity).toBe(JUMP_VELOCITY);
  });

  it('jumps normally again once the timer is 0', () => {
    const game = chilled();
    const seen = jumps(game);
    jumpApex(game, 2);
    game.state.chillTimer = 0;
    tick(game, 10);
    const apex = jumpApex(game, 60);
    expect(seen[1]!.velocity).toBe(JUMP_VELOCITY);
    expect(apex).toBe(jumpApex(createPlayerTestGame(), 60));
  });
});

describe('chill animation timing', () => {
  /** Rides `ticks` ticks without input; returns the push/ride animation state and clock. */
  function cruise(chillTimer: number, ticks: number) {
    const game = createPlayerTestGame();
    const controller = new SkaterController(game.bus);
    const state = game.state;
    state.chillTimer = chillTimer;
    const idle = { pressed: false, held: false, released: false, holdTime: 0 };
    for (let i = 0; i < ticks; i++) controller.update(state, { action: idle, duck: idle }, TICK_DT);
    return controller.view(state.player);
  }

  it('pushes with a slower animation clock while chilled', () => {
    const normal = cruise(0, 30);
    const chill = cruise(30, 30);
    expect(chill.anim).toBe('push');
    expect(normal.anim).toBe('push');
    expect(chill.time).toBeCloseTo(normal.time * CHILL_ANIM_RATE);
  });

  it('waits longer between pushes while chilled (lazier rhythm)', () => {
    const ticks = Math.round((PUSH_TIME + 0.1) / TICK_DT);
    expect(cruise(0, ticks).anim).toBe('ride');
    expect(cruise(30, ticks).anim).toBe('push');
  });
});

describe('chill overlay selection', () => {
  const names = Object.keys(TIMELINES) as TimelineName[];

  it('puts the joint in the mouth in every pose except the crash', () => {
    for (const name of names) {
      for (const step of TIMELINES[name].steps) {
        const joint = chillJoint(name, step.body);
        if (name === 'crash') expect(joint).toBeNull();
        else expect(joint, `${name} body ${step.body}`).not.toBeNull();
      }
    }
  });

  it('places the joint at the mouth of the head in that frame', () => {
    const head = HEAD_AT[B.duck]!;
    expect(chillJoint('duck', B.duck)).toEqual({ x: head.x + 9, y: head.y + 6 });
  });

  it('has a red-eyed variant of every frame that shows a head, the rest unchanged', () => {
    expect(CHILL_BODY_FRAMES).toHaveLength(BODY_FRAMES.length);
    BODY_FRAMES.forEach((frame, i) => {
      const chill = CHILL_BODY_FRAMES[i]!;
      if (HEAD_AT[i]) {
        expect(chill.join('')).toContain('e');
        expect(frame.join('')).not.toContain('e');
      } else {
        expect(chill).toEqual(frame);
      }
    });
  });

  it('shows the duck pose with the joint too', () => {
    expect(chillJoint('duck', poseAt('duck', 1).body)).not.toBeNull();
  });
});

describe('smoke puffs', () => {
  it('is a pure function of time', () => {
    expect(smokePuffs(1.234)).toEqual(smokePuffs(1.234));
    expect(smokePuffs(0.5)).toEqual(smokePuffs(0.5 + SMOKE_PERIOD));
  });

  it('rises and drifts left as a puff ages, at whole pixels', () => {
    const puffs = [0, 0.2, 0.4, 0.6].map((t) => smokePuffs(t)[0]!);
    for (let i = 1; i < puffs.length; i++) {
      expect(puffs[i]!.dy).toBeLessThanOrEqual(puffs[i - 1]!.dy);
      expect(puffs[i]!.dx).toBeLessThanOrEqual(puffs[i - 1]!.dx);
    }
    expect(puffs[3]!.dy).toBeLessThan(0);
    expect(puffs[3]!.dx).toBeLessThan(0);
    for (const t of [0, 0.37, 0.91, 1.5]) {
      for (const p of smokePuffs(t)) {
        expect(Number.isInteger(p.dx) && Number.isInteger(p.dy) && Number.isInteger(p.size)).toBe(true);
      }
    }
  });

  it('keeps a few small puffs in the air', () => {
    for (const t of [0, 0.3, 0.7, 1.1]) {
      const puffs = smokePuffs(t);
      expect(puffs.length).toBeGreaterThanOrEqual(2);
      expect(puffs.length).toBeLessThanOrEqual(4);
      for (const p of puffs) expect(p.size).toBeLessThanOrEqual(2);
    }
  });
});
