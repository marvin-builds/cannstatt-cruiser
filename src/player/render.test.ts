import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIGH_FIVE_TIME } from './high-five';
import { poseAt, TIMELINES, type TimelineName } from './poses';
import { drawPose, drawSkater } from './render';
import { createPlayerTestGame, playerController, tick } from './testing';
import { ITEM_USE_TIME } from './use';

/** A 2D context that ignores every call (Vitest runs without a DOM). */
function nullContext(): CanvasRenderingContext2D {
  return new Proxy({}, { get: () => () => {} }) as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => nullContext() }) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('drawSkater in kid mode', () => {
  it('draws a carried beer (and its use as kid mode eats it) without throwing', () => {
    const game = createPlayerTestGame();
    game.state.kidMode = true;
    game.state.carriedItem = 'beer';
    const g = nullContext();
    const draw = () => {
      const c = playerController(game);
      drawSkater(g, game.state, c.view(game.state.player), c);
    };
    expect(draw).not.toThrow();
    game.state.carriedItem = null;
    // Kid mode eats it; a debug hook may still ask for the adult drink.
    for (const action of ['eat', 'drink'] as const) {
      game.bus.emit('itemUsed', { item: 'beer', action });
      for (let t = 0; t < ITEM_USE_TIME[action] * 60 + 2; t++) {
        tick(game);
        expect(draw, `${action} tick ${t}`).not.toThrow();
      }
    }
  });
});

describe('the high five arm', () => {
  it('draws in every pose, phase and side without throwing (none in the crash frames)', () => {
    const g = nullContext();
    for (const name of Object.keys(TIMELINES) as TimelineName[]) {
      for (const arm of ['raise', 'slap', 'lower'] as const) {
        for (const side of ['ahead', 'over', 'behind'] as const) {
          const draw = () => drawPose(g, poseAt(name, 0.01), 60, 150, { highFive: { arm, side }, carry: { item: 'beer', timeline: name, catching: true } });
          expect(draw, `${name} ${arm} ${side}`).not.toThrow();
        }
      }
    }
  });

  it('draws through a whole high five in kid mode', () => {
    const game = createPlayerTestGame();
    game.state.kidMode = true;
    game.bus.emit('highFive', { entityId: -1, points: 100 });
    const c = playerController(game);
    for (let t = 0; t < HIGH_FIVE_TIME * 60 + 2; t++) {
      tick(game);
      expect(() => drawSkater(nullContext(), game.state, c.view(game.state.player), c)).not.toThrow();
    }
  });
});
