/**
 * Test tooling (Vitest): a human-like bot that takes stunt lines, and a ride
 * of one designed line with it in a real game (player + gameplay, the speed
 * pinned, nothing else on the street). The bot never jumps on the street (the
 * kickers launch it), rolls off a ledge before a drop and, on a ledge before
 * a gap, aims at the middle of the gap jump's take-off window (stunt-sim.ts)
 * with up to `jitter` ticks of error, holding its hold. DOM-free; not used by
 * the game itself.
 */
import { PLAYER_X } from '../core/config';
import type { Game } from '../core/game';
import { Rng } from '../core/rng';
import { createPlayerTestGame, tick } from '../player/testing';
import type { Entity, GameEvents } from '../types';
import { isLedge } from './catalogue';
import { createGameplaySystem } from './index';
import type { Pattern } from './patterns';
import { gapHolds } from './stunt-line';
import { HUMAN_STYLE } from './testing';
import { jumpWindow, stepOf, windowMiddle } from './stunt-sim';

const lineOf = (e: Entity) => Number(e.data?.line ?? 0);
const stepIn = (e: Entity) => Number(e.data?.step ?? 0);

export class StuntBot {
  /** Ticks until the planned press (-1: none planned). */
  private wait = -1;
  private hold = 0;
  private holding = 0;
  /** The ledge the current plan was made on. */
  private plannedOn = -1;

  constructor(
    private readonly rng: Rng,
    private readonly jitter = HUMAN_STYLE.takeoffJitter,
  ) {}

  /** Call before every tick; apply the returned action change. */
  next(game: Game): 'press' | 'release' | null {
    if (this.holding > 0) {
      this.holding--;
      return this.holding === 0 ? 'release' : null;
    }
    const { state } = game;
    const p = state.player;
    if (!p.grinding) {
      this.plannedOn = -1;
      this.wait = -1;
      return null;
    }
    const ledge = state.entities.find((e) => isLedge(e.kind) && e.y === p.y && e.x - 12 <= p.x && p.x <= e.x + e.w);
    if (!ledge) return null;
    if (this.plannedOn !== ledge.id) {
      this.plannedOn = ledge.id;
      this.wait = this.plan(game, ledge);
    }
    if (this.wait < 0) return null;
    if (this.wait > 0) {
      this.wait--;
      return null;
    }
    this.wait = -1;
    this.holding = this.hold;
    return 'press';
  }

  /** Ticks to wait before the gap jump from `ledge` onto the line's next ledge, or -1 (none: roll off). */
  private plan(game: Game, ledge: Entity): number {
    const next = game.state.entities.find((e) => lineOf(e) === lineOf(ledge) && stepIn(e) === stepIn(ledge) + 1);
    if (!next || !isLedge(next.kind)) return -1;
    const w = jumpWindow(ledge, PLAYER_X, stepOf(game.state.speed), next, gapHolds(ledge));
    if (!w) return -1;
    this.hold = w.hold;
    return Math.max(0, windowMiddle(w) + this.rng.int(-this.jitter, this.jitter));
  }
}

export interface LineRide {
  /** The line's end, or null if it never ended. */
  end: GameEvents['stuntEnd'] | null;
  steps: GameEvents['stuntStep'][];
  crashes: number;
  healthLost: number;
}

/** Rides `pattern` (a stunt line) at a pinned `speed` with the bot; the line's first kicker starts `lead` px ahead of the skater. */
export function rideLine(pattern: Pattern, speed: number, seed: number, zone = 0, lead = 60): LineRide {
  const game = createPlayerTestGame([createGameplaySystem({ spawning: false })]);
  game.setSpeedOverride(speed);
  game.commands.setZone(zone);
  tick(game, 2);
  const dx = PLAYER_X + lead - pattern.pieces[0]!.x;
  let id = 50_000;
  for (const p of pattern.pieces) game.state.entities.push({ ...p, data: p.data && { ...p.data }, id: id++, x: p.x + dx, done: false });
  const ride: LineRide = { end: null, steps: [], crashes: 0, healthLost: 0 };
  game.bus.on('stuntStep', (e) => ride.steps.push(e));
  game.bus.on('stuntEnd', (e) => (ride.end ??= e));
  game.bus.on('crash', () => ride.crashes++);
  const health = game.state.health;
  const bot = new StuntBot(new Rng(seed));
  const ticks = Math.ceil((pattern.length + lead) / stepOf(speed)) + 120;
  for (let i = 0; i < ticks && !ride.end; i++) {
    const move = bot.next(game);
    if (move === 'press') game.buttons.action.press('bot');
    if (move === 'release') game.buttons.action.release('bot');
    tick(game);
  }
  ride.healthLost = health - game.state.health;
  return ride;
}
