/**
 * Gameplay slice: obstacles, people, rails, stars and the joint, drawn as a
 * bubble gum in kid mode (catalogue.ts, art.ts, people-art.ts, motion.ts;
 * every sprite rasterised at startup, sprites.ts, rails and overhead signs
 * composed into one canvas each, composed.ts),
 * the distance-based spawner with clearability check, planned ahead under a
 * per-tick work budget (spawner.ts, patterns.ts, course.ts, solver.ts,
 * jumpsim.ts), difficulty (difficulty.ts) and the chill effect (chill.ts),
 * contacts and crashes (contacts.ts, health.ts), stomps on people with the
 * tossed item (stomp.ts, items.ts, toss.ts, item-art.ts), using the carried
 * item (use.ts: drink, eat, throw the ball, ball.ts; a Maßkrug kept too
 * long is drunk by itself, auto-drink.ts), the item a person hit by the
 * ball drops onto the street for the skater to pick up (drop.ts), grind tricks
 * (grind-trick.ts) and air tricks (air-trick.ts), the human margins for every take-off, around people and
 * while drunk (fairness.ts), score/combo (scoring.ts) and the stunt lines:
 * kickers, ledges of the upper level and their combo (stunt-line.ts plans
 * them, stunts.ts launches and scores, stunt-art.ts draws them), and the
 * NorDIY park in Bad Cannstatt (spawner.ts plans it into state.park with its
 * line, park-line.ts; park.ts cheers and pays the session; high-five.ts;
 * park-art.ts draws the high fiver and the park's banks and ledges; the
 * speed ramp pauses inside, spawner.rampDistance).
 */
import { START_ZONE } from '../core/config';
import { Rng } from '../core/rng';
import { testHookEnabled } from '../core/testhook';
import type { CarriedItem, Entity, GameContext, ParkPlan, System } from '../types';
import { ZoneRoute } from '../world/zones';
import { drawEntity, drawSparkle, SPARKLE_TICKS, warmArt } from './art';
import { AirTrickScore } from './air-trick';
import { AutoDrink } from './auto-drink';
import { newBall, updateBalls } from './ball';
import { GRIND_POINTS, isLedge, isObstacle, isRail } from './catalogue';
import { chillSpeedFactor, countDownChill } from './chill';
import { isLive, resolveContacts } from './contacts';
import { installGameplayDebug } from './debug';
import { speedAt } from './difficulty';
import { GrindTrick } from './grind-trick';
import { DroppedItems } from './drop';
import { drawDrops, drawToss } from './item-art';
import { ITEM_POINTS, itemOf } from './items';
import { ParkSession } from './park';
import { anchorOf, moveTo } from './motion';
import { addPoints, breakCombo } from './scoring';
import { StuntLines } from './stunts';
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

/** The tossed item reached the hands (or a dropped one was picked up): carry it, score the bonus, tell everyone. */
function catchItem(ctx: GameContext, item: CarriedItem | null): void {
  if (!item) return;
  ctx.state.carriedItem = item;
  addPoints(ctx.state, ctx.bus, ITEM_POINTS);
  ctx.bus.emit('itemCaught', { item });
}

const isPickup = (e: Entity) => e.kind === 'star' || e.kind === 'joint';
/** Drawn first: rails and the stunt ledges with their thin posts. */
const isBehind = (e: Entity) => isRail(e.kind) || isLedge(e.kind);

export function createGameplaySystem(options: GameplayOptions = {}): System {
  const spawning = options.spawning ?? true;
  /** Mirror of the world's zone schedule, so people match the zone their pattern lies in. */
  const route = new ZoneRoute();
  const spawner = new Spawner((street) => route.zoneAt(street), { workPerTick: PLAN_WORK_PER_TICK });
  const situation: SpawnSituation = { drunk: false, kidMode: false };
  const sparkles: Sparkle[] = [];
  const toss = new ItemToss();
  const drops = new DroppedItems();
  const trick = new GrindTrick();
  const autoDrink = new AutoDrink();
  const stunts = new StuntLines();
  const airTrick = new AirTrickScore(() => stunts.multiplier());
  const session = new ParkSession();
  /** The spawner's park plan last put into state.park. */
  let spawnerPark: ParkPlan | null = null;
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
    followPark(ctx);
  }

  /** A new park plan goes into state.park; a dropped one (replanned while drunk) leaves it before the park was reached. */
  function followPark(ctx: GameContext): void {
    const planned = spawner.park;
    if (planned === spawnerPark) return;
    const { state } = ctx;
    if (planned) state.park = planned;
    else if (state.park === spawnerPark && state.distance < spawnerPark!.start) state.park = null;
    spawnerPark = planned;
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
      // All art rasterised at startup: a first draw mid-run was a render spike on phones.
      warmArt();
      if (typeof window !== 'undefined' && testHookEnabled()) installGameplayDebug(ctx, drops, stunts, (start, end, distance) => spawner.reserve(start, end, distance));
      ctx.bus.on('runStarted', () => {
        route.snap(START_ZONE, 0);
        spawner.reset(new Rng(ctx.rng.int(0, 0xffffffff)));
        sparkles.length = 0;
        toss.reset();
        drops.reset();
        trick.reset();
        autoDrink.reset();
        stunts.reset();
        airTrick.reset();
        session.reset();
        spawnerPark = null;
      });
      ctx.bus.on('gameOver', () => {
        ctx.state.drunkTimer = 0;
      });
      // The world rides into the zone its route predicts; any other zone change (setZone) snaps the route.
      ctx.bus.on('zoneChanged', (e) => {
        if (route.zoneAt(ctx.state.distance) !== e.index) route.snap(e.index, ctx.state.distance);
      });
      ctx.bus.on('land', () => {
        breakCombo(ctx.state);
        stunts.landed(ctx);
        airTrick.touchedDown();
      });
      ctx.bus.on('grindStart', (e) => {
        trick.grindStarted(ctx, e.entityId);
        if (!ctx.state.player.grinding) return;
        airTrick.touchedDown();
        const ledge = ctx.state.entities.find((s) => s.id === e.entityId);
        if (ledge && isLedge(ledge.kind)) stunts.made(ctx, ledge);
      });
      ctx.bus.on('grindEnd', (e) => stunts.grindEnded(e.entityId));
      ctx.bus.on('launch', () => airTrick.launched());
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
      // The person hit by the ball lets go of their item: it falls onto free street ahead.
      ctx.bus.on('ballHit', (e) => {
        const person = ctx.state.entities.find((s) => s.id === e.entityId);
        if (!person) return;
        const hand = { x: person.x + person.w / 2, y: person.y + Math.round(person.h / 3) };
        drops.drop(itemOf(person, ctx.state.kidMode), hand, ctx.state.speed, freeStreet);
      });
      ctx.bus.on('crash', () => {
        toss.cancel();
        stunts.crashed(ctx);
        airTrick.crashedNow();
      });
      ctx.bus.on('itemCaught', () => autoDrink.reset());
      const cheer = () => session.trick(ctx);
      ctx.bus.on('grindTrick', cheer);
      ctx.bus.on('airTrick', cheer);
      ctx.bus.on('stuntStep', cheer);
      ctx.bus.on('itemUsed', () => autoDrink.reset());
    },

    update(ctx, dt) {
      const { state } = ctx;
      if (state.mode !== 'playing') return;
      countDownChill(ctx, dt);
      countDownDrunk(ctx, dt);
      if (ctx.speedOverride === null) state.speed = speedAt(spawner.rampDistance(state.distance)) * chillSpeedFactor(state.chillTimer);
      const dx = state.speed * dt;
      scroll(ctx, dx);
      if (state.player.grinding) addPoints(state, ctx.bus, GRIND_POINTS);
      trick.update(ctx);
      airTrick.update(ctx);
      useCarriedItem(ctx, ballThrower, autoDrink.due(state));
      updateBalls(ctx, dt, freeStreet);
      drops.update(dx, dt);
      // Before the contacts, so an item tossed by this tick's stomp starts flying next tick.
      catchItem(ctx, toss.update(handsOf(ctx), dt));
      if (state.player.state !== 'crash') catchItem(ctx, drops.pickUp(state.player.hitbox));
      resolveContacts(ctx);
      stunts.update(ctx);
      airTrick.settle(ctx);
      session.update(ctx);
      despawn(state.entities);
      updateSparkles(dx);
    },

    render: {
      entities({ g, state, scrollLead }) {
        const entities = state.entities;
        // Rails and stunt ledges behind the obstacles below them, stars on top.
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i]!;
          if (isLive(e) && isBehind(e)) drawEntity(g, e, state, scrollLead);
        }
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i]!;
          if (isLive(e) && !isBehind(e) && !isPickup(e)) drawEntity(g, e, state, scrollLead);
        }
        drawDrops(g, drops, state.frame, scrollLead);
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
