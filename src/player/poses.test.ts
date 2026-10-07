import { describe, expect, it } from 'vitest';
import { B, BD, BODY_FRAMES, BOARD_FRAMES } from './art';
import { poseAt, TIMELINES, type TimelineName, timelineFor } from './poses';
import { CRASH_TIME } from './tuning';

describe('poses', () => {
  it('loops looping timelines', () => {
    const first = poseAt('push', 0);
    const total = TIMELINES.push.steps.reduce((s, x) => s + x.t, 0);
    expect(poseAt('push', total + 0.001)).toBe(first);
    expect(poseAt('push', 0.15).body).toBe(B.pushDown);
  });

  it('holds the last step of one-shot timelines', () => {
    expect(poseAt('jump', 0).body).toBe(B.crouch);
    expect(poseAt('jump', 5)).toMatchObject({ body: B.airRise, board: BD.pop });
  });

  it('picks the rising or falling air pose from vy', () => {
    const view = { anim: 'air' as const, time: 0, visible: true, standingUp: false };
    expect(timelineFor(view, -10)).toBe('airRise');
    expect(timelineFor(view, 10)).toBe('airFall');
    expect(timelineFor({ ...view, anim: 'grind' }, 0)).toBe('grind');
  });

  it('ducks through a short crouch and stands up through it again', () => {
    const view = { anim: 'duck' as const, time: 0, visible: true, standingUp: false };
    expect(poseAt(timelineFor(view, 0), 0).body).toBe(B.crouch);
    expect(poseAt(timelineFor(view, 0), 1).body).toBe(B.duck);
    const up = { ...view, anim: 'ride' as const, standingUp: true };
    expect(poseAt(timelineFor(up, 0), 0).body).toBe(B.crouch);
  });

  it('the crash ends standing on the board under the skater within CRASH_TIME', () => {
    const end = poseAt('crash', CRASH_TIME - 0.01);
    expect(end.boardDx ?? 0).toBe(0);
    expect(end.body).toBe(B.crouch);
  });

  it('only references existing frames', () => {
    for (const name of Object.keys(TIMELINES) as TimelineName[]) {
      for (const step of TIMELINES[name].steps) {
        expect(BODY_FRAMES[step.body]).toBeDefined();
        expect(BOARD_FRAMES[step.board]).toBeDefined();
      }
    }
  });
});
