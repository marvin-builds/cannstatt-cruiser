/**
 * Player slice: the middle-aged cruiser on his longboard. Logic lives in
 * controller.ts (tunables in tuning.ts), art in art.ts, timelines in poses.ts,
 * drawing in render.ts. The contract for gameplay (grind, crash, hitbox) is
 * documented in CONTRACT.md; test helpers are in testing.ts.
 */
import { testHookEnabled } from '../core/testhook';
import type { System } from '../types';
import { SkaterController } from './controller';
import { drawDebugRails, installPlayerDebug } from './debug';
import { drawSkater } from './render';

export function createPlayerSystem(): System {
  let controller: SkaterController | null = null;
  let debug = false;

  return {
    name: 'player',

    init(ctx) {
      const c = new SkaterController(ctx.bus);
      controller = c;
      ctx.bus.on('runStarted', () => c.reset());
      ctx.bus.on('grindStart', (e) => c.startGrind(ctx.state, e.entityId));
      ctx.bus.on('grindEnd', (e) => c.endGrindExternally(ctx.state, e.entityId));
      ctx.bus.on('crash', () => c.crash(ctx.state));
      debug = typeof window !== 'undefined' && testHookEnabled();
      if (debug) installPlayerDebug(ctx);
    },

    update(ctx, dt) {
      controller?.update(ctx.state, ctx.input, dt);
    },

    render: {
      entities(r) {
        if (debug) drawDebugRails(r);
      },
      player(r) {
        if (controller) drawSkater(r.g, r.state, controller.view(r.state.player));
      },
    },
  };
}
