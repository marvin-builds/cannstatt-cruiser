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

/** The player system; `controller` (set in init) is for tests (see testing.ts). */
export interface PlayerSystem extends System {
  readonly controller: SkaterController | null;
}

export function createPlayerSystem(): PlayerSystem {
  let controller: SkaterController | null = null;
  let debug = false;

  return {
    name: 'player',

    get controller() {
      return controller;
    },

    init(ctx) {
      const c = new SkaterController(ctx.bus);
      controller = c;
      ctx.bus.on('runStarted', (e) => c.reset(e.seed));
      ctx.bus.on('grindStart', (e) => c.startGrind(ctx.state, e.entityId));
      ctx.bus.on('grindEnd', (e) => c.endGrindExternally(ctx.state, e.entityId));
      ctx.bus.on('crash', (e) => c.crash(ctx.state, e.kind, e.entityId));
      ctx.bus.on('stomp', () => c.stomp());
      ctx.bus.on('launch', (e) => c.launch(e.velocity));
      ctx.bus.on('itemCaught', () => c.catchItem());
      ctx.bus.on('itemUsed', (e) => c.useItem(e.item, e.action));
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
        if (controller) drawSkater(r.g, r.state, controller.view(r.state.player), controller);
      },
    },
  };
}
