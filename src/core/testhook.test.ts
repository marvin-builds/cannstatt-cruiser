import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { type Clock, createTestHook } from './testhook';

function setup() {
  const game = new Game({ systems: [] });
  const clock: Clock = {
    freeze: () => {},
    unfreeze: () => {},
    frozen: true,
    setTimeScale: () => {},
    redraw: () => {},
    capture: () => '',
  };
  return { game, hook: createTestHook(game, clock) };
}

describe('test hook', () => {
  it('sets health, and core ends the run at zero health', () => {
    const { hook } = setup();
    hook.startRun();
    hook.setHealth(2);
    expect(hook.state().health).toBe(2);
    hook.setHealth(0);
    expect(hook.step(1).mode).toBe('gameover');
  });

  it('ends the run immediately with endRun', () => {
    const { hook } = setup();
    hook.startRun();
    hook.setScore(1234);
    hook.endRun();
    expect(hook.state().mode).toBe('gameover');
    expect(hook.events('gameOver')[0]?.payload).toMatchObject({ score: 1234 });
  });

  it('throws from endRun outside the playing mode so scripts fail loudly', () => {
    const { hook } = setup();
    hook.startRun();
    hook.pauseGame();
    expect(() => hook.endRun()).toThrow(/playing/);
    expect(hook.state().mode).toBe('paused');
  });

  it('overrides the speed until cleared', () => {
    const { hook } = setup();
    hook.startRun();
    hook.setSpeed(300);
    expect(hook.step(60).distance).toBeCloseTo(300, 3);
    hook.setSpeed(null);
    expect(hook.state().speed).toBe(300);
  });

  it('returns events logged at or after a frame', () => {
    const { hook } = setup();
    hook.step(5);
    const since = hook.state().frame;
    hook.startRun();
    hook.pauseGame();
    hook.step(3);
    hook.resumeGame();
    expect(hook.eventsSince(since).map((e) => e.name)).toEqual(['runStarted', 'pause', 'resume']);
    expect(hook.eventsSince(since, 'resume')).toHaveLength(1);
    expect(hook.eventsSince(since + 3).map((e) => e.name)).toEqual(['resume']);
    expect(hook.eventsSince(since + 4)).toHaveLength(0);
  });

  it('presses, releases and holds duck', () => {
    const { game, hook } = setup();
    const held: boolean[] = [];
    hook.startRun();
    const probe = () => held.push(game.ctx.input.duck.held);
    hook.input.duck.press();
    hook.step(1);
    probe();
    hook.input.duck.release();
    hook.step(1);
    probe();
    hook.input.duck.hold(5);
    probe();
    hook.step(1);
    probe();
    expect(held).toEqual([true, false, true, false]);
  });

  it('reports the current display info', () => {
    const { game, hook } = setup();
    game.display.viewWidth = 422;
    expect(hook.display()).toMatchObject({ viewWidth: 422, viewHeight: 180 });
  });
});
