import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../core/config';
import { KICKFLIP_FADE, KICKFLIP_REFRESH_SECONDS, KickflipFade } from './flip-fade';

/** Plays `seconds` of ticks without a kickflip. */
function quiet(fade: KickflipFade, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TICK_DT); i++) fade.update(TICK_DT, false);
}

describe('kickflip repetition fade (ROADMAP 41)', () => {
  it('consecutive kickflips pay 100%, 50%, 25%, then 10% of their base', () => {
    expect(KICKFLIP_FADE).toEqual([1, 0.5, 0.25, 0.1]);
    const fade = new KickflipFade();
    expect([fade.next(), fade.next(), fade.next(), fade.next(), fade.next()]).toEqual([1, 0.5, 0.25, 0.1, 0.1]);
  });

  it('a refresh (something else happened) makes the next one full again', () => {
    const fade = new KickflipFade();
    fade.next();
    fade.next();
    fade.refresh();
    expect(fade.next()).toBe(1);
  });

  it(`about ${KICKFLIP_REFRESH_SECONDS} s of playing time without a kickflip refresh it; a running kickflip restarts the clock`, () => {
    expect(KICKFLIP_REFRESH_SECONDS).toBe(3);
    const fade = new KickflipFade();
    fade.next();
    quiet(fade, KICKFLIP_REFRESH_SECONDS - 0.5);
    fade.update(TICK_DT, true);
    quiet(fade, KICKFLIP_REFRESH_SECONDS - 0.5);
    expect(fade.next()).toBe(0.5);
    quiet(fade, KICKFLIP_REFRESH_SECONDS);
    expect(fade.next()).toBe(1);
  });

  it('reset (run start) forgets the streak', () => {
    const fade = new KickflipFade();
    fade.next();
    fade.reset();
    expect(fade.next()).toBe(1);
  });
});
