import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawSkater } from './render';
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
