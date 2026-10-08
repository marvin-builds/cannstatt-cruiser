/**
 * Gameplay slice: obstacles, people, rails, stars and the joint, drawn as a
 * bubble gum in kid mode (catalogue.ts, art.ts, people-art.ts, motion.ts),
 * the distance-based spawner with
 * clearability check (spawner.ts, patterns.ts, course.ts, solver.ts,
 * jumpsim.ts), difficulty (difficulty.ts) and the chill effect (chill.ts),
 * contacts and crashes (contacts.ts, health.ts), stomps on people with the
 * tossed item (stomp.ts, items.ts, toss.ts, item-art.ts), the human margins
 * for every take-off and around people (fairness.ts) and score/combo
 * (scoring.ts).
 */
import { Rng } from '../core/rng';
import { testHookEnabled } from '../core/testhook';
import type { CarriedItem, Entity, GameContext, System } from '../types';
import { ZoneRoute } from '../world/zones';
import { drawEntity, drawSparkle, SPARKLE_TICKS } from './art';
import { GRIND_POINTS, isRail } from './catalogue';
import { chillSpeedFactor, countDownChill } from './chill';
import { isLive, resolveContacts } from './contacts';
import { installGameplayDebug } from './debug';
import { speedAt } from './difficulty';
import { drawToss } from './item-art';
import { ITEM_POINTS } from './items';
import { anchorOf, moveTo } from './motion';
import { addPoints, breakCombo } from './scoring';
import { Spawner } from './spawner';
import { ItemToss, type Point } from './toss';

export interface GameplayOptions {
  /** False keeps the street empty (tests place entities themselves). */
  spawning?: boolean;
}

interface Sparkle {
  x: number;
  y: number;
  age: number;
}

/** Where the skater holds a caught item: in front of the belly (lower while ducking). */
function handsOf(ctx: GameContext): Point {
  const p = ctx.state.player;
  return { x: p.x + 3, y: p.y - Math.round(p.hitbox.h / 2) };
}

/** The tossed item reached the hands: carry it, score the bonus, tell everyone. */
function catchItem(ctx: GameContext, item: CarriedItem | null): void {
  if (!item) return;
  ctx.state.carriedItem = item;
  addPoints(ctx.state, ctx.bus, ITEM_POINTS);
  ctx.bus.emit('itemCaught', { item });
}

export function createGameplaySystem(options: GameplayOptions = {}): System {
  const spawning = options.spawning ?? true;
  /** Mirror of the world's zone schedule, so people match the zone their pattern lies in. */
  const route = new ZoneRoute();
  const spawner = new Spawner((street) => route.zoneAt(street));
  let sparkles: Sparkle[] = [];
  const toss = new ItemToss();

  function scroll(ctx: GameContext, dx: number): void {
    const { state } = ctx;
    for (const e of state.entities) if (isLive(e)) moveTo(e, anchorOf(e) - dx);
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
      if (typeof window !== 'undefined' && testHookEnabled()) installGameplayDebug(ctx);
      ctx.bus.on('runStarted', () => {
        route.snap(0, 0);
        spawner.reset(new Rng(ctx.rng.int(0, 0xffffffff)));
        sparkles = [];
        toss.reset();
      });
      // The world rides into the zone its route predicts; any other zone change (setZone) snaps the route.
      ctx.bus.on('zoneChanged', (e) => {
        if (route.zoneAt(ctx.state.distance) !== e.index) route.snap(e.index, ctx.state.distance);
      });
      ctx.bus.on('land', () => breakCombo(ctx.state));
      const sparkleAt = (id: number) => {
        const e = ctx.state.entities.find((s) => s.id === id);
        if (e) sparkles.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, age: 0 });
      };
      ctx.bus.on('starCollected', (e) => sparkleAt(e.entityId));
      ctx.bus.on('chillStart', (e) => sparkleAt(e.entityId));
      ctx.bus.on('stomp', (e) => {
        const person = ctx.state.entities.find((s) => s.id === e.entityId);
        if (person) toss.launch(e.item, { x: person.x + person.w / 2, y: person.y + 2 }, handsOf(ctx));
      });
      ctx.bus.on('crash', () => toss.cancel());
    },

    update(ctx, dt) {
      const { state } = ctx;
      if (state.mode !== 'playing') return;
      countDownChill(ctx, dt);
      if (ctx.speedOverride === null) state.speed = speedAt(state.distance) * chillSpeedFactor(state.chillTimer);
      const dx = state.speed * dt;
      scroll(ctx, dx);
      if (state.player.grinding) addPoints(state, ctx.bus, GRIND_POINTS);
      // Before the contacts, so an item tossed by this tick's stomp starts flying next tick.
      catchItem(ctx, toss.update(handsOf(ctx), dt));
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
        for (const e of live) if (isRail(e.kind)) drawEntity(g, e, state);
        const pickup = (e: Entity) => e.kind === 'star' || e.kind === 'joint';
        for (const e of live) if (!isRail(e.kind) && !pickup(e)) drawEntity(g, e, state);
        for (const e of live) if (pickup(e)) drawEntity(g, e, state);
      },
      fx({ g }) {
        for (const s of sparkles) drawSparkle(g, s.x, s.y, s.age);
        drawToss(g, toss);
      },
    },
  };
}
