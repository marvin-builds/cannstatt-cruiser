/**
 * Gameplay slice: obstacles, rails and stars (catalogue.ts, art.ts), the
 * distance-based spawner with clearability check (spawner.ts, patterns.ts,
 * solver.ts, jumpsim.ts), difficulty (difficulty.ts), contacts and crashes
 * (contacts.ts, health.ts) and score/combo (scoring.ts).
 */
import { Rng } from '../core/rng';
import type { Entity, GameContext, System } from '../types';
import { drawEntity, drawSparkle, SPARKLE_TICKS } from './art';
import { GRIND_POINTS, isRail } from './catalogue';
import { isLive, resolveContacts } from './contacts';
import { speedAt } from './difficulty';
import { addPoints, breakCombo } from './scoring';
import { Spawner } from './spawner';

export interface GameplayOptions {
  /** False keeps the street empty (tests place entities themselves). */
  spawning?: boolean;
}

interface Sparkle {
  x: number;
  y: number;
  age: number;
}

export function createGameplaySystem(options: GameplayOptions = {}): System {
  const spawning = options.spawning ?? true;
  const spawner = new Spawner();
  let sparkles: Sparkle[] = [];

  function scroll(ctx: GameContext, dx: number): void {
    const { state } = ctx;
    for (const e of state.entities) if (isLive(e)) e.x -= dx;
    if (!spawning) return;
    spawner.scroll(dx);
    spawner.spawn(state.entities, state.distance + dx, ctx.display.viewWidth, ctx.speedOverride);
  }

  function despawn(entities: Entity[]): void {
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i]!;
      if (isLive(e) && e.x + e.w < 0) entities.splice(i, 1);
    }
  }

  return {
    name: 'gameplay',

    init(ctx) {
      ctx.bus.on('runStarted', () => {
        spawner.reset(new Rng(ctx.rng.int(0, 0xffffffff)));
        sparkles = [];
      });
      ctx.bus.on('land', () => breakCombo(ctx.state));
      ctx.bus.on('starCollected', (e) => {
        const star = ctx.state.entities.find((s) => s.id === e.entityId);
        if (star) sparkles.push({ x: star.x + star.w / 2, y: star.y + star.h / 2, age: 0 });
      });
    },

    update(ctx, dt) {
      const { state } = ctx;
      if (state.mode !== 'playing') return;
      if (ctx.speedOverride === null) state.speed = speedAt(state.distance);
      const dx = state.speed * dt;
      scroll(ctx, dx);
      if (state.player.grinding) addPoints(state, ctx.bus, GRIND_POINTS);
      resolveContacts(ctx);
      despawn(state.entities);
      for (const s of sparkles) {
        s.x -= dx;
        s.age++;
      }
      sparkles = sparkles.filter((s) => s.age < SPARKLE_TICKS);
    },

    render: {
      entities({ g, state }) {
        const live = state.entities.filter(isLive);
        // Rails behind the obstacles below them, stars on top.
        for (const e of live) if (isRail(e.kind)) drawEntity(g, e, state.frame);
        for (const e of live) if (!isRail(e.kind) && e.kind !== 'star') drawEntity(g, e, state.frame);
        for (const e of live) if (e.kind === 'star') drawEntity(g, e, state.frame);
      },
      fx({ g }) {
        for (const s of sparkles) drawSparkle(g, s.x, s.y, s.age);
      },
    },
  };
}
