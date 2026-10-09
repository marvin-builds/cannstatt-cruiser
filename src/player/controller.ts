/**
 * DOM-free skater logic: variable jump with coyote time and jump buffer,
 * rail riding, ducking (on the ground only), the grind trick (down on a
 * rail), the air trick (down in the air), the stomp bounce and the kicker
 * launch, crash/invulnerability and the animation state (incl. the catch
 * reach, the item use, the grab pose of big air, the hard landing and the
 * board tilt on a kicker). One instance per player system;
 * `reset()` at every run start.
 */
import { GROUND_Y, TICK_DT } from '../core/config';
import type { CarriedItem, Entity, EntityKind, GameBus, GameState, InputFrame, ItemAction, PlayerAnim, PlayerState, Rect } from '../types';
import { airTrickTicks, canStartAirTrick } from './air-trick';
import { BinCrash } from './bin';
import * as T from './tuning';
import { ITEM_USE_TIME, MugToss, TOSS_AT } from './use';

/** What the renderer needs besides PlayerState. */
export interface AnimView {
  anim: PlayerAnim;
  /** Seconds since `anim` started. */
  time: number;
  /** False on the "off" half of an invulnerability blink. */
  visible: boolean;
  /** Just stood up from a duck (show the short crouch). */
  standingUp: boolean;
  /** Reaching up for a caught item (CATCH_TIME after itemCaught). */
  catching: boolean;
  /** The crash playing is the head-first dive into a bin (timeline `binCrash`). */
  binCrash: boolean;
  /** Grind trick look: turning to the camera (in-between frame, also on the way back), facing it, or none. */
  trick: TrickPose | null;
  /** Big air (a launch, or a jump GRAB_HEIGHT above its take-off): grabbing the board, until close to the street. */
  grab: boolean;
  /** Landing (anim `land`) with an impact of at least HARD_LANDING_IMPACT: the deeper squash with dust. */
  hardLanding: boolean;
  /** Rolling over a kicker on the street (before the launch): the board tilts up the ramp. */
  onKicker: boolean;
  /** Px the ramp surface lifts the drawn skater while onKicker (0 elsewhere); y stays GROUND_Y. */
  kickerLift: number;
  /**
   * Clock of the kickflip timeline (seconds since the air trick started,
   * slowed for the longer launch kickflip so its flip spans the same share of
   * the trick), or null when none runs.
   */
  airTrick: number | null;
  /** The item being used (itemUsed) and the seconds since, or null. */
  use: ItemUse | null;
}

export type TrickPose = 'turn' | 'front';

export interface ItemUse {
  item: CarriedItem;
  action: ItemAction;
  time: number;
}

/** Where the mug leaves the hand when tossed, relative to the wheel contact point (about the shoulder). */
const TOSS_FROM = { dx: 2, dy: -26 } as const;

/** A take-off gameplay asked for (stomp bounce or kicker launch), applied at the start of the next tick. */
interface TakeOff {
  velocity: number;
  /** A launch: big air (grab pose) from the take-off on. */
  launch: boolean;
}

export class SkaterController {
  private boosting = false;
  private boostTime = 0;
  private coyote = 0;
  private buffer = 0;
  private sinceJump = Infinity;
  private landTimer = 0;
  private crashTimer = 0;
  private cruiseTime = 0;
  private railId: number | null = null;
  private grindTicks = 0;
  private ducking = false;
  private standUpTimer = 0;
  private anim: PlayerAnim = 'ride';
  private animTime = 0;
  /** state.chillTimer > 0 at the start of this tick (gameplay counts it down after the player). */
  private chill = false;
  /** A stomp or launch arrived after the player's update: take off at the start of the next tick. */
  private takeOff: TakeOff | null = null;
  /** y the skater last left the ground or a rail from (big air is measured from it). */
  private takeOffY = GROUND_Y;
  private bigAir = false;
  /** In the air after a kicker launch (the full kickflip); cleared on any support or crash. */
  private launched = false;
  private hardLanding = false;
  private onKicker = false;
  private kickerLift = 0;
  /** Ticks since the air trick started, or -1 when none runs. */
  private airTrickTick = -1;
  /** Ticks the running air trick lasts (airTrickTicks). */
  private airTrickLength = 0;
  private catchTimer = 0;
  /** Grind trick held (down on the rail) and seconds since it started. */
  private tricking = false;
  private trickTime = 0;
  /** Seconds left of the in-between frame turning back after the trick. */
  private turnBack = 0;
  private use: ItemUse | null = null;
  /** The empty mug tossed away after drinking (read by render.ts). */
  readonly toss = new MugToss();
  /** Bin crash: lid colour and the bin tumbling away after the pop (read by render.ts). */
  readonly bin = new BinCrash();

  constructor(private readonly bus: GameBus) {}

  reset(): void {
    this.boosting = false;
    this.boostTime = 0;
    this.coyote = 0;
    this.buffer = 0;
    this.sinceJump = Infinity;
    this.landTimer = 0;
    this.crashTimer = 0;
    this.cruiseTime = 0;
    this.railId = null;
    this.grindTicks = 0;
    this.ducking = false;
    this.standUpTimer = 0;
    this.anim = 'ride';
    this.animTime = 0;
    this.chill = false;
    this.takeOff = null;
    this.takeOffY = GROUND_Y;
    this.bigAir = false;
    this.launched = false;
    this.hardLanding = false;
    this.onKicker = false;
    this.kickerLift = 0;
    this.airTrickTick = -1;
    this.airTrickLength = 0;
    this.catchTimer = 0;
    this.tricking = false;
    this.trickTime = 0;
    this.turnBack = 0;
    this.use = null;
    this.toss.reset();
    this.bin.reset();
  }

  get crashing(): boolean {
    return this.crashTimer > 0;
  }

  view(p: PlayerState): AnimView {
    const blinking = p.invulnerableTimer > 0 && !this.crashing;
    const visible = !blinking || Math.floor(p.invulnerableTimer / (T.BLINK_PERIOD / 2)) % 2 === 0;
    return {
      anim: this.anim,
      time: this.animTime,
      visible,
      standingUp: this.standUpTimer > 0,
      catching: this.catchTimer > 0,
      binCrash: this.bin.diving,
      trick: this.trickPose(p),
      use: this.use,
      grab: this.bigAir && !(p.vy > 0 && GROUND_Y - p.y < T.GRAB_RELEASE_HEIGHT),
      hardLanding: this.hardLanding && this.anim === 'land',
      onKicker: this.onKicker,
      kickerLift: this.kickerLift,
      airTrick: this.airTrickTick >= 0 ? (this.airTrickTick * TICK_DT * T.STREET_AIR_TRICK_TICKS) / this.airTrickLength : null,
    };
  }

  private trickPose(p: PlayerState): TrickPose | null {
    if (this.tricking) return this.trickTime < T.TRICK_TURN_TIME ? 'turn' : 'front';
    return this.turnBack > 0 && p.grinding ? 'turn' : null;
  }

  /** Gameplay: the carried item was used (itemUsed). Plays the use animation; a crash cuts it short. */
  useItem(item: CarriedItem, action: ItemAction): void {
    if (!this.crashing) this.use = { item, action, time: 0 };
  }

  /** Gameplay: the falling board landed on a person's head (stomp). Bounces on the next tick. */
  stomp(): void {
    this.queueTakeOff({ velocity: T.STOMP_BOUNCE_VELOCITY, launch: false });
  }

  /** Gameplay: the skater rode onto a kicker (launch). Takes off with `velocity` on the next tick, no hold boost. */
  launch(velocity: number): void {
    this.queueTakeOff({ velocity, launch: true });
  }

  /** Ignored while crashing; of two in one tick the faster one wins. */
  private queueTakeOff(takeOff: TakeOff): void {
    if (this.crashing) return;
    if (!this.takeOff || takeOff.velocity > this.takeOff.velocity) this.takeOff = takeOff;
  }

  /** Gameplay: the tossed item reached the skater (itemCaught). Starts the catch reach. */
  catchItem(): void {
    if (!this.crashing) this.catchTimer = T.CATCH_TIME;
  }

  /** Gameplay put the player on rail `entityId` (grindStart). */
  startGrind(state: GameState, entityId: number): void {
    const rail = findRail(state, entityId);
    if (!rail || this.crashing) return;
    const p = state.player;
    this.railId = entityId;
    this.grindTicks = 0;
    this.boosting = false;
    this.coyote = 0;
    p.grinding = true;
    p.grounded = false;
    this.endAirTrick(p);
    p.y = rail.y;
    p.vy = 0;
  }

  /** Gameplay ended the grind itself (grindEnd it emitted): drop off without re-emitting. */
  endGrindExternally(state: GameState, entityId: number): void {
    if (this.railId !== entityId) return;
    this.leaveRail(state.player, false);
  }

  /**
   * Gameplay reported a collision (crash) with entity `entityId` of `kind`.
   * Ignored while invulnerable. A bin dives head first into it on the rolling
   * board (no hop); every other kind throws the skater off.
   */
  crash(state: GameState, kind?: EntityKind, entityId = -1): void {
    const p = state.player;
    if (p.invulnerableTimer > 0 || this.crashing) return;
    if (p.grinding) this.leaveRail(p, true);
    this.crashTimer = T.CRASH_TIME;
    this.takeOff = null;
    this.bigAir = false;
    this.launched = false;
    this.catchTimer = 0;
    this.use = null;
    this.setTrick(p, false);
    this.endAirTrick(p);
    p.invulnerableTimer = T.INVULNERABLE_TIME;
    this.boosting = false;
    this.buffer = 0;
    this.coyote = 0;
    if (kind === 'bin') {
      this.bin.start(state, entityId);
      return;
    }
    this.bin.stopDiving();
    p.grounded = false;
    p.vy = Math.min(p.vy, -T.CRASH_HOP_VELOCITY);
  }

  update(state: GameState, input: Pick<InputFrame, 'action' | 'duck'>, dt: number): void {
    const p = state.player;
    this.chill = state.chillTimer > 0;
    if (state.mode === 'title') this.setAnim('ride', dt);
    if (state.mode !== 'playing') return;

    const { action } = input;
    this.countDown(p, dt);
    this.advanceAirTrick(p);
    if (action.pressed && !this.crashing) this.buffer = T.JUMP_BUFFER;
    if (!action.held) this.boosting = false;
    if (p.grounded || p.grinding) this.takeOffY = p.y;
    this.applyTakeOff(p);
    this.tryJump(p);

    if (p.grinding) this.ride(state);
    else if (!p.grounded) this.fall(p, dt);
    this.buffer = Math.max(0, this.buffer - dt);
    // After the physics, so a jump (even from a duck) stands up and a landing with duck held ducks at once.
    this.setDucking(input.duck.held && p.grounded && !this.crashing);
    // Down on a rail is the grind trick instead (no duck, the grind goes on).
    this.setTrick(p, input.duck.held && p.grinding && !this.crashing);
    this.updateBigAir(p);
    // After the physics, from the post-move y/vy: down in the air is the air trick (never a duck).
    if (input.duck.pressed) this.tryAirTrick(p);
    // The front wheel reaches the ramp first: lift from there on, crouch once the contact point is over it.
    const kicker = p.grounded && !this.crashing ? kickerAhead(state) : null;
    this.onKicker = kicker !== null && kicker.x <= p.x;
    this.kickerLift = kicker ? rampLift(kicker, p.x + T.KICKER_WHEEL_REACH) : 0;

    this.setAnim(this.pickAnim(p), dt);
    p.state = this.anim;
    p.hitbox = hitboxFor(p);
    this.bin.update(state, this.crashing ? this.animTime : null, dt);
    this.advanceUse(p, dt);
    this.toss.update(dt, state.speed);
  }

  private setTrick(p: PlayerState, on: boolean): void {
    if (on && !this.tricking) this.trickTime = 0;
    if (!on && this.tricking) this.turnBack = p.grinding ? T.TRICK_TURN_TIME : 0;
    this.tricking = on;
    p.grindTrick = on;
  }

  /** Starts the air trick if none runs and canStartAirTrick allows it (airborne, not on a rail, not crashing). */
  private tryAirTrick(p: PlayerState): void {
    if (this.airTrickTick >= 0 || p.grounded || p.grinding || this.crashing) return;
    if (!canStartAirTrick(p.y, p.vy, this.launched)) return;
    this.airTrickTick = 0;
    this.airTrickLength = airTrickTicks(this.launched);
    p.airTrick = true;
  }

  /** Counts the running air trick on; it ends after its length or on the landing (see air-trick.ts). */
  private advanceAirTrick(p: PlayerState): void {
    if (this.airTrickTick < 0) return;
    this.airTrickTick++;
    if (this.airTrickTick >= this.airTrickLength) this.endAirTrick(p);
  }

  /** Ends the air trick at once: done, or cut short by a rail / ledge catch or a crash. */
  private endAirTrick(p: PlayerState): void {
    this.airTrickTick = -1;
    p.airTrick = false;
  }

  /** Runs the item use clock; the drink tosses the empty mug at TOSS_AT. */
  private advanceUse(p: PlayerState, dt: number): void {
    const use = this.use;
    if (!use) return;
    const before = use.time;
    use.time += dt;
    if (use.action === 'drink' && before < TOSS_AT && use.time >= TOSS_AT) this.toss.start(p.x + TOSS_FROM.dx, p.y + TOSS_FROM.dy);
    if (use.time >= ITEM_USE_TIME[use.action]) this.use = null;
  }

  private setDucking(ducking: boolean): void {
    if (this.ducking && !ducking) this.standUpTimer = T.DUCK_TRANSITION;
    this.ducking = ducking;
    if (ducking) this.standUpTimer = 0;
  }

  private countDown(p: PlayerState, dt: number): void {
    p.invulnerableTimer = Math.max(0, p.invulnerableTimer - dt);
    this.standUpTimer = Math.max(0, this.standUpTimer - dt);
    this.crashTimer = Math.max(0, this.crashTimer - dt);
    this.catchTimer = Math.max(0, this.catchTimer - dt);
    this.turnBack = Math.max(0, this.turnBack - dt);
    if (this.tricking) this.trickTime += dt;
    this.landTimer = Math.max(0, this.landTimer - dt);
    this.sinceJump += dt;
    this.cruiseTime += dt * this.cruiseRate();
  }

  private canJump(p: PlayerState): boolean {
    return !this.crashing && (p.grounded || p.grinding || this.coyote > 0);
  }

  private tryJump(p: PlayerState): void {
    if (this.buffer <= 0 || !this.canJump(p)) return;
    if (p.grinding) this.leaveRail(p, true);
    this.buffer = 0;
    this.coyote = 0;
    this.boosting = true;
    this.boostTime = 0;
    this.sinceJump = 0;
    p.grounded = false;
    const velocity = jumpVelocity(this.chill);
    p.vy = -velocity;
    this.bus.emit('jump', { velocity });
  }

  /**
   * The stomp bounce or kicker launch: a take-off like a jump with the action
   * already released (normal gravity from this tick on, no hold boost, a
   * press in this tick does not jump on top) and no jump event. Ignored on a rail.
   */
  private applyTakeOff(p: PlayerState): void {
    const takeOff = this.takeOff;
    if (!takeOff) return;
    this.takeOff = null;
    if (p.grinding || this.crashing) return;
    this.boosting = false;
    this.coyote = 0;
    this.buffer = 0;
    p.grounded = false;
    p.vy = -takeOff.velocity;
    this.launched = takeOff.launch;
    if (takeOff.launch) this.bigAir = true;
  }

  /** Big air starts with a launch or GRAB_HEIGHT above the take-off and ends on any support or crash (so does `launched`). */
  private updateBigAir(p: PlayerState): void {
    if (p.grounded || p.grinding || this.crashing) {
      this.bigAir = false;
      this.launched = false;
    } else if (this.takeOffY - p.y >= T.GRAB_HEIGHT) this.bigAir = true;
  }

  private ride(state: GameState): void {
    const p = state.player;
    const rail = findRail(state, this.railId);
    if (!rail || p.x > rail.x + rail.w) {
      this.leaveRail(p, true);
      this.coyote = T.COYOTE_TIME;
      return;
    }
    this.grindTicks++;
    p.y = rail.y;
    p.vy = 0;
  }

  private leaveRail(p: PlayerState, emit: boolean): void {
    const entityId = this.railId;
    this.railId = null;
    p.grinding = false;
    this.setTrick(p, false);
    if (emit && entityId !== null) this.bus.emit('grindEnd', { entityId, ticks: this.grindTicks });
  }

  private fall(p: PlayerState, dt: number): void {
    this.coyote = Math.max(0, this.coyote - dt);
    const boosted = this.boosting && p.vy < 0 && this.boostTime < T.MAX_JUMP_HOLD;
    if (boosted) this.boostTime += dt;
    else this.boosting = false;
    p.vy = Math.min(T.MAX_FALL_SPEED, p.vy + (boosted ? T.HOLD_GRAVITY : T.GRAVITY) * dt);
    p.y += p.vy * dt;
    if (p.y >= GROUND_Y) this.land(p);
  }

  private land(p: PlayerState): void {
    const impact = p.vy;
    p.y = GROUND_Y;
    p.vy = 0;
    p.grounded = true;
    this.coyote = 0;
    this.landTimer = T.LAND_TIME;
    this.hardLanding = impact >= T.HARD_LANDING_IMPACT;
    this.cruiseTime = 0;
    // A street kickflip still running is caught on touch-down (looks only, the landing is the same).
    this.endAirTrick(p);
    this.bus.emit('land', { impact });
    this.tryJump(p);
  }

  private pickAnim(p: PlayerState): PlayerAnim {
    if (this.crashing) return 'crash';
    if (p.grinding) return 'grind';
    if (!p.grounded) return this.sinceJump < T.OLLIE_TIME ? 'jump' : 'air';
    if (this.ducking) return 'duck';
    if (this.landTimer > 0) return 'land';
    return this.cruiseTime % T.PUSH_PERIOD < T.PUSH_TIME ? 'push' : 'ride';
  }

  /** Rate of the cruise clock (push rhythm) and of the ride/push animations: lazier while chilled. */
  private cruiseRate(): number {
    return this.chill ? T.CHILL_ANIM_RATE : 1;
  }

  private setAnim(anim: PlayerAnim, dt: number): void {
    const cruising = anim === 'ride' || anim === 'push';
    if (anim === this.anim) this.animTime += cruising ? dt * this.cruiseRate() : dt;
    else {
      this.anim = anim;
      this.animTime = 0;
    }
  }
}

/** Take-off speed: JUMP_VELOCITY, scaled by CHILL_JUMP_SCALE while chilled (nothing else changes). */
export function jumpVelocity(chill: boolean): number {
  return chill ? T.JUMP_VELOCITY * T.CHILL_JUMP_SCALE : T.JUMP_VELOCITY;
}

/** The kicker under the board: from its front wheel (KICKER_WHEEL_REACH ahead) to the contact point past its end, or null. */
function kickerAhead(state: GameState): Entity | null {
  const { x } = state.player;
  for (const e of state.entities) if (e.kind === 'kicker' && e.x <= x + T.KICKER_WHEEL_REACH && x <= e.x + e.w) return e;
  return null;
}

/** Lift for the front wheel at `wheelX`: the ramp surface there (street at its left end, full height from the lip on), minus the board tilt. */
function rampLift(kicker: Rect, wheelX: number): number {
  const surface = Math.max(0, Math.min(kicker.h, Math.round((kicker.h * (wheelX - kicker.x)) / kicker.w)));
  return Math.max(0, surface - 1);
}

function findRail(state: GameState, id: number | null): Entity | undefined {
  return id === null ? undefined : state.entities.find((e) => e.id === id);
}

/** Body box above the wheel contact point; lower in the tuck, while ducking and while tumbling. */
function hitboxFor(p: PlayerState): Rect {
  const { HITBOX_W: w } = T;
  const h = hitboxHeight(p.state);
  return { x: p.x - w / 2, y: p.y - h, w, h };
}

function hitboxHeight(anim: PlayerAnim): number {
  const H = T.HITBOX_H;
  if (anim === 'crash') return H.crashed;
  if (anim === 'duck') return H.ducking;
  return anim === 'jump' || anim === 'air' ? H.tucked : H.standing;
}
