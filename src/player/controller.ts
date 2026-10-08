/**
 * DOM-free skater logic: variable jump with coyote time and jump buffer,
 * rail riding, ducking (on the ground only), the stomp bounce, crash/
 * invulnerability and the animation state (incl. the catch reach). One instance
 * per player system; `reset()` at every run start.
 */
import { GROUND_Y } from '../core/config';
import type { Entity, EntityKind, GameBus, GameState, InputFrame, PlayerAnim, PlayerState, Rect } from '../types';
import { BinCrash } from './bin';
import * as T from './tuning';

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
  /** A stomp arrived after the player's update: bounce at the start of the next tick. */
  private bouncePending = false;
  private catchTimer = 0;
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
    this.bouncePending = false;
    this.catchTimer = 0;
    this.bin.reset();
  }

  get crashing(): boolean {
    return this.crashTimer > 0;
  }

  view(p: PlayerState): AnimView {
    const blinking = p.invulnerableTimer > 0 && !this.crashing;
    const visible = !blinking || Math.floor(p.invulnerableTimer / (T.BLINK_PERIOD / 2)) % 2 === 0;
    return { anim: this.anim, time: this.animTime, visible, standingUp: this.standUpTimer > 0, catching: this.catchTimer > 0, binCrash: this.bin.diving };
  }

  /** Gameplay: the falling board landed on a person's head (stomp). Bounces on the next tick. */
  stomp(): void {
    if (!this.crashing) this.bouncePending = true;
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
    this.bouncePending = false;
    this.catchTimer = 0;
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
    if (action.pressed && !this.crashing) this.buffer = T.JUMP_BUFFER;
    if (!action.held) this.boosting = false;
    this.bounce(p);
    this.tryJump(p);

    if (p.grinding) this.ride(state);
    else if (!p.grounded) this.fall(p, dt);
    this.buffer = Math.max(0, this.buffer - dt);
    // After the physics, so a jump (even from a duck) stands up and a landing with duck held ducks at once.
    this.setDucking(input.duck.held && p.grounded && !this.crashing);

    this.setAnim(this.pickAnim(p), dt);
    p.state = this.anim;
    p.hitbox = hitboxFor(p);
    this.bin.update(state, this.crashing ? this.animTime : null, dt);
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
   * The stomp bounce: a take-off like a jump with the action already released
   * (normal gravity from this tick on, no hold boost) and no jump event.
   */
  private bounce(p: PlayerState): void {
    if (!this.bouncePending) return;
    this.bouncePending = false;
    if (p.grinding || this.crashing) return;
    this.boosting = false;
    this.coyote = 0;
    p.grounded = false;
    p.vy = -T.STOMP_BOUNCE_VELOCITY;
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
    this.cruiseTime = 0;
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
