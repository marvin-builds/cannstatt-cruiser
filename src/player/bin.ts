/**
 * Bin crash state (head first into a Mülltonne, see the `binCrash` timeline
 * in poses.ts): the hit bin's lid colour, and the bin that tumbles away to
 * the left once the skater pops out. Gameplay removes the hit bin entity on
 * the crash, so from then on the player draws it. DOM-free and deterministic.
 */
import type { GameState } from '../types';
import { BIN_ANCHOR_X, BIN_SIZE } from './bin-art';
import { BIN_POP_AT } from './tuning';

/** Lid colours, in gameplay's `data.variant` order (Restmüll, Papier, Bio). */
export const BIN_LID_COUNT = 3;
/** Seconds the bin flies from the deck down to the street, rolling over. */
export const BIN_FLY_TIME = 0.4;
/** Px the pop knocks the bin back at once (clear of the skater's legs). */
const BIN_KNOCK = 7;
/** Extra px the pop kicks the bin to the left while it flies (on top of the street scrolling). */
const BIN_KICK = 26;
/** Height of the arc above the straight drop from the deck. */
const BIN_HOP = 6;
/** Height of the deck surface above the street (bin bottom when it sits on the board). */
const DECK_LIFT = 7;
/** Seconds per quarter turn while flying. */
const TURN_TIME = 0.08;
/** Rotation frames (see BIN_FRAMES): upright, then quarter turns to the left; the pop tips it over at once. */
const TURNS = 4;
const FIRST_TURN = 1;
/** Lying on its side once it landed. */
const REST_FRAME = 1;
/** Safety limit: a tumbling bin disappears after this long even if still on screen (speed 0). */
const MAX_TUMBLE = 3;

/** Where the tumbling bin is, relative to the skater's contact point (see binTumbleAt). */
export interface BinTumble {
  /** Rotation frame of BIN_FRAMES. */
  frame: number;
  /** Horizontal offset from the contact point (negative = behind him). */
  dx: number;
  /** Px of the bin frame's bottom above the street. */
  lift: number;
}

/**
 * The bin `t` seconds after the pop, with the street `scrolled` px further
 * along since then: kicked left off the deck in a small arc, rolling over,
 * then lying on its side and moving with the street. Writes into `out`.
 */
export function binTumbleAt(t: number, scrolled: number, out: BinTumble): BinTumble {
  const u = Math.min(1, t / BIN_FLY_TIME);
  const flying = t < BIN_FLY_TIME;
  out.frame = flying ? (FIRST_TURN + Math.floor(t / TURN_TIME)) % TURNS : REST_FRAME;
  out.dx = 0 - Math.round(BIN_KNOCK + BIN_KICK * (1 - (1 - u) * (1 - u)) + scrolled);
  out.lift = flying ? Math.round(DECK_LIFT * (1 - u) + BIN_HOP * 4 * u * (1 - u)) : 0;
  return out;
}

export class BinCrash {
  /** The current crash is a bin crash (the skater is in the bin or popping out). */
  diving = false;
  /** Lid colour index of the hit bin. */
  lid = 0;
  /** Seconds since the pop while the bin tumbles away, or -1. */
  tumbleTime = -1;
  /** state.distance at the pop: the lying bin moves with the street from there. */
  private popDistance = 0;
  private scrolled = 0;

  reset(): void {
    this.diving = false;
    this.lid = 0;
    this.tumbleTime = -1;
    this.popDistance = 0;
    this.scrolled = 0;
  }

  /** A bin crash starts: take the lid colour from the hit entity (if it is still there). */
  start(state: GameState, entityId: number): void {
    const hit = state.entities.find((e) => e.id === entityId);
    this.reset();
    this.diving = true;
    this.lid = Math.abs(Math.floor(Number(hit?.data?.variant ?? 0))) % BIN_LID_COUNT;
  }

  /** Another kind of crash: no bin on the board (a bin already tumbling keeps going). */
  stopDiving(): void {
    this.diving = false;
  }

  /**
   * Every playing tick, after the animation state: `crashTime` is the seconds
   * into the crash animation, or null once it is over.
   */
  update(state: GameState, crashTime: number | null, dt: number): void {
    if (this.tumbleTime >= 0) this.advanceTumble(state, dt);
    else if (this.diving && crashTime !== null && crashTime >= BIN_POP_AT) {
      this.tumbleTime = 0;
      this.popDistance = state.distance;
      this.scrolled = 0;
    }
    if (crashTime === null) this.diving = false;
  }

  /** The tumbling bin now (only meaningful while tumbleTime >= 0). */
  tumble(out: BinTumble): BinTumble {
    return binTumbleAt(this.tumbleTime, this.scrolled, out);
  }

  private advanceTumble(state: GameState, dt: number): void {
    this.tumbleTime += dt;
    this.scrolled = state.distance - this.popDistance;
    const right = state.player.x + binTumbleAt(this.tumbleTime, this.scrolled, scratch).dx - BIN_ANCHOR_X + BIN_SIZE;
    if (right < 0 || this.tumbleTime > MAX_TUMBLE) this.tumbleTime = -1;
  }
}

const scratch: BinTumble = { frame: 0, dx: 0, lift: 0 };
