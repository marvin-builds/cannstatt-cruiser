/**
 * Gameplay slice: obstacles, people, rails, stars and the joint, drawn as a
 * bubble gum in kid mode (catalogue.ts, art.ts, people-art.ts, motion.ts),
 * the distance-based spawner with clearability check, planned ahead under a
 * per-tick work budget (spawner.ts, patterns.ts, course.ts, solver.ts,
 * jumpsim.ts), difficulty (difficulty.ts) and the chill effect (chill.ts),
 * contacts and crashes (contacts.ts, health.ts), stomps on people with the
 * tossed item (stomp.ts, items.ts, toss.ts, item-art.ts), using the carried
 * item (use.ts: drink, eat, throw the ball, ball.ts; a Maßkrug kept too
 * long is drunk by itself, auto-drink.ts), grind tricks
 * (grind-trick.ts), the human margins for every take-off, around people and
 * while drunk (fairness.ts) and score/combo (scoring.ts).
 */
import { START_ZONE } from '../core/config';
import { Rng } from '../core/rng';
import { testHookEnabled } from '../core/testhook';
import type { CarriedItem, Entity, GameContext, System } from '../types';
import { ZoneRoute } from '../world/zones';
import { drawEntity, drawSparkle, SPARKLE_TICKS } from './art';
import { AutoDrink } from './auto-drink';
import { newBall, updateBalls } from './ball';
import { GRIND_POINTS, isObstacle, isRail } from './catalogue';
import { chillSpeedFactor, countDownChill } from './chill';
import { isLive, resolveContacts } from './contacts';
import { installGameplayDebug } from './debug';
import { speedAt } from './difficulty';
import { GrindTrick } from './grind-trick';
import { drawToss } from './item-art';
import { ITEM_POINTS } from './items';
import { anchorOf, moveTo } from './motion';
import { addPoints, breakCombo } from './scoring';
import { PLAN_WORK_PER_TICK, Spawner, type SpawnSituation } from './spawner';
import { ItemToss, type Point } from './toss';
import { countDownDrunk, useCarriedItem } from './use';

export interface GameplayOptions {
  /** False keeps the street empty (tests place entities themselves). */
  spawning?: boolean;
}

interface Sparkle {
  x: number;
  y: number;
  age: number;
}

/** Thrown balls get ids from here (the spawner counts from 1, the debug hook from 800 000). */
const BALL_IDS = 700_000;

/** The tossed item reached the hands: carry it, score the bonus, tell everyone. */
function catchItem(ctx: GameContext, item: CarriedItem | null): void {
  if (!item) return;
  ctx.state.carriedItem = item;
  addPoints(ctx.state, ctx.bus, ITEM_POINTS);
  ctx.bus.emit('itemCaught', { item });
}

const isPickup = (e: Entity) => e.kind === 'star' || e.kind === 'joint';

export function createGameplaySystem(options: GameplayOptions = {}): System {
  const spawning = options.spawning ?? true;
  /** Mirror of the world's zone schedule, so people match the zone their pattern lies in. */
  const route = new ZoneRoute();
  const spawner = new Spawner((street) => route.zoneAt(street), { workPerTick: PLAN_WORK_PER_TICK });
  const situation: SpawnSituation = { drunk: false, kidMode: false };
  const sparkles: Sparkle[] = [];
  const toss = new ItemToss();
  const trick = new GrindTrick();
  const autoDrink = new AutoDrink();
  /** Where the skater holds an item: in front of the belly (lower while ducking). Updated in place. */
  const hands: Point = { x: 0, y: 0 };
  let nextBallId = BALL_IDS;
  /** The context from init, for the callbacks below (created once, so update allocates no closures). */
  let game: GameContext | null = null;
  const ballThrower = () => throwBall(game!);
  const freeStreet = (from: number, to: number) => streetFree(game!, from, to);

  function handsOf(ctx: GameContext): Point {
    const p = ctx.state.player;
    hands.x = p.x + 3;
    hands.y = p.y - Math.round(p.hitbox.h / 2);
    return hands;
  }

  /** The player may ride drunk into what is planned now: drunk, or a Maßkrug in hand or on its way there. */
  function mayBeDrunk(ctx: GameContext): boolean {
    const { state } = ctx;
    return state.drunkTimer > 0 || state.carriedItem === 'beer' || toss.flight?.item === 'beer';
  }

  function scroll(ctx: GameContext, dx: number): void {
    const { state } = ctx;
    const entities = state.entities;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      if (isLive(e)) moveTo(e, anchorOf(e) - dx);
    }
    if (!spawning) return;
    spawner.scroll(dx);
    situation.drunk = mayBeDrunk(ctx);
    situation.kidMode = state.kidMode;
    spawner.spawn(entities, state.distance + dx, ctx.display.viewWidth, ctx.speedOverride, situation);
  }

  /** No obstacle or rail (and no pattern still to come) between screen x `from` and `to`: room for a ricochet. */
  function streetFree(ctx: GameContext, from: number, to: number): boolean {
    if (spawning && spawner.upcomingX() < to) return false;
    const entities = ctx.state.entities;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      if (e.done || !isLive(e) || !(isObstacle(e.kind) || isRail(e.kind))) continue;
      if (e.x < to && e.x + e.w > from) return false;
    }
    return true;
  }

  function throwBall(ctx: GameContext): void {
    const ball = newBall(nextBallId++, handsOf(ctx), ctx.state.speed);
    ctx.state.entities.push(ball);
    ctx.bus.emit('ballThrown', { entityId: ball.id });
  }

  function despawn(entities: Entity[]): void {
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i]!;
      if (isLive(e) && e.x + e.w < 0) entities.splice(i, 1);
    }
  }

  function updateSparkles(dx: number): void {
    let kept = 0;
    for (let i = 0; i < sparkles.length; i++) {
      const s = sparkles[i]!;
      s.x -= dx;
      s.age++;
      if (s.age < SPARKLE_TICKS) sparkles[kept++] = s;
    }
    sparkles.length = kept;
  }

  return {
    name: 'gameplay',

    init(ctx) {
      game = ctx;
      if (typeof window !== 'undefined' && testHookEnabled()) installGameplayDebug(ctx);
      ctx.bus.on('runStarted', () => {
        route.snap(START_ZONE, 0);
        spawner.reset(new Rng(ctx.rng.int(0, 0xffffffff)));
        sparkles.length = 0;
        toss.reset();
        trick.reset();
        autoDrink.reset();
      });
      ctx.bus.on('gameOver', () => {
        ctx.state.drunkTimer = 0;
      });
      // The world rides into the zone its route predicts; any other zone change (setZone) snaps the route.
      ctx.bus.on('zoneChanged', (e) => {
        if (route.zoneAt(ctx.state.distance) !== e.index) route.snap(e.index, ctx.state.distance);
      });
      ctx.bus.on('land', () => breakCombo(ctx.state));
      ctx.bus.on('grindStart', (e) => trick.grindStarted(ctx, e.entityId));
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
      ctx.bus.on('itemCaught', () => autoDrink.reset());
      ctx.bus.on('itemUsed', () => autoDrink.reset());
    },

    update(ctx, dt) {
      const { state } = ctx;
      if (state.mode !== 'playing') return;
      countDownChill(ctx, dt);
      countDownDrunk(ctx, dt);
      if (ctx.speedOverride === null) state.speed = speedAt(state.distance) * chillSpeedFactor(state.chillTimer);
      const dx = state.speed * dt;
      scroll(ctx, dx);
      if (state.player.grinding) addPoints(state, ctx.bus, GRIND_POINTS);
      trick.update(ctx);
      useCarriedItem(ctx, ballThrower, autoDrink.due(state));
      updateBalls(ctx, dt, freeStreet);
      // Before the contacts, so an item tossed by this tick's stomp starts flying next tick.
      catchItem(ctx, toss.update(handsOf(ctx), dt));
      resolveContacts(ctx);
      despawn(state.entities);
      updateSparkles(dx);
    },

    render: {
      entities({ g, state, scrollLead }) {
        const entities = state.entities;
        // Rails behind the obstacles below them, stars on top.
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i]!;
          if (isLive(e) && isRail(e.kind)) drawEntity(g, e, state, scrollLead);
        }
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i]!;
          if (isLive(e) && !isRail(e.kind) && !isPickup(e)) drawEntity(g, e, state, scrollLead);
        }
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i]!;
          if (isLive(e) && isPickup(e)) drawEntity(g, e, state, scrollLead);
        }
      },
      fx({ g, scrollLead }) {
        for (let i = 0; i < sparkles.length; i++) {
          const s = sparkles[i]!;
          drawSparkle(g, s.x - scrollLead, s.y, s.age);
        }
        drawToss(g, toss);
      },
    },
  };
}
