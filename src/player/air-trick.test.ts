import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { airTicksLeft, airTrickTicks, canStartAirTrick } from './air-trick';
import { BD } from './art';
import { poseAt, timelineFor } from './poses';
import { addRail, crash, createPlayerTestGame, playerController, startGrind, tick } from './testing';
import { AIR_TRICK_HEIGHT, AIR_TRICK_TICKS, HITBOX_H, STREET_AIR_TRICK_MIN_AIR, STREET_AIR_TRICK_TICKS } from './tuning';

/** Launch speeds gameplay uses (debug default 360, ledges 42..58 px up -> ~382..433). */
const LAUNCHES = [330, 360, 382, 433];

function launch(game: Game, velocity = 360): void {
  game.bus.emit('launch', { entityId: 5, velocity });
}

/** A duck press (released again after one tick, like a short key tap). */
function pressDown(game: Game): void {
  game.buttons.duck.press('test');
  tick(game);
  game.buttons.duck.release('test');
}

interface Sample {
  y: number;
  vy: number;
  grounded: boolean;
  airTrick: boolean;
  state: string;
}

/** Ticks until the skater is on the ground again (at most 240), recording every tick; `at(i)` runs before tick i. */
function fly(game: Game, at: (i: number) => void = () => {}): Sample[] {
  const samples: Sample[] = [];
  for (let i = 0; i < 240; i++) {
    at(i);
    tick(game);
    const p = game.state.player;
    samples.push({ y: p.y, vy: p.vy, grounded: p.grounded, airTrick: p.airTrick, state: p.state });
    if (p.grounded && i > 0) break;
  }
  return samples;
}

/** Launch, then press down before tick `pressAt` of the flight (0 = the take-off tick). */
function launchWithPress(velocity: number, pressAt: number | null): Sample[] {
  const game = createPlayerTestGame();
  tick(game, 3);
  launch(game, velocity);
  return fly(game, (i) => {
    if (i === pressAt) game.buttons.duck.press('test');
    if (pressAt !== null && i === pressAt + 1) game.buttons.duck.release('test');
  });
}

describe('airTicksLeft (remaining air time to the street)', () => {
  it('counts the ticks until the wheels reach the street, exactly like the fall physics', () => {
    const game = createPlayerTestGame();
    launch(game, 360);
    tick(game);
    const { y, vy } = game.state.player;
    const flight = fly(game);
    expect(airTicksLeft(y, vy)).toBe(flight.length);
  });

  it('is 0 on the ground and small just above it while falling', () => {
    expect(airTicksLeft(GROUND_Y, 0)).toBe(0);
    expect(airTicksLeft(GROUND_Y - 1, 300)).toBe(1);
  });
});

describe('air trick start rule', () => {
  it('lasts about 0.35-0.45 s', () => {
    expect(AIR_TRICK_TICKS * TICK_DT).toBeGreaterThanOrEqual(0.35);
    expect(AIR_TRICK_TICKS * TICK_DT).toBeLessThanOrEqual(0.45);
  });

  it('starts on every launch right after the take-off and keeps the air pose (no duck in the air)', () => {
    for (const v of LAUNCHES) {
      const flight = launchWithPress(v, 1);
      expect(flight[1]!.airTrick, `launch ${v}`).toBe(true);
      expect(flight[1]!.state).not.toBe('duck');
    }
  });

  it('runs exactly AIR_TRICK_TICKS ticks and is over before the landing tick', () => {
    const flight = launchWithPress(360, 2);
    const on = flight.flatMap((s, i) => (s.airTrick ? [i] : []));
    expect(on).toEqual(Array.from({ length: AIR_TRICK_TICKS }, (_, k) => 2 + k));
    for (const i of on) expect(flight[i]!.grounded).toBe(false);
    expect(flight.at(-1)!.grounded).toBe(true);
    expect(flight.at(-1)!.airTrick).toBe(false);
  });

  it('starts only while enough air time is left to finish it before touching down', () => {
    const plain = launchWithPress(360, null);
    for (let k = 1; k < plain.length - 1; k++) {
      const flight = launchWithPress(360, k);
      const before = plain[k]!;
      const allowed = airTicksLeft(before.y, before.vy) >= AIR_TRICK_TICKS;
      expect(flight[k]!.airTrick, `press at tick ${k}`).toBe(allowed);
      expect(flight.some((s) => s.grounded && s.airTrick), `press at tick ${k}`).toBe(false);
    }
    // Late in the fall it is ignored.
    expect(launchWithPress(360, plain.length - 5).some((s) => s.airTrick)).toBe(false);
  });

  it('never starts on a tiny hop (tap jump), whenever down is pressed', () => {
    for (let k = 0; k < 20; k++) {
      const game = createPlayerTestGame();
      tick(game, 3);
      game.buttons.action.press('test');
      const flight = fly(game, (i) => {
        if (i === 2) game.buttons.action.release('test');
        if (i === k) game.buttons.duck.press('test');
        if (i === k + 1) game.buttons.duck.release('test');
      });
      expect(flight.some((s) => s.airTrick), `press at tick ${k}`).toBe(false);
    }
  });

  it('is reachable on a big (full-hold) jump, never below AIR_TRICK_HEIGHT above the street', () => {
    const starts: number[] = [];
    for (let k = 0; k < 40; k++) {
      const game = createPlayerTestGame();
      tick(game, 3);
      game.buttons.action.press('test'); // held through the whole jump
      tick(game, k);
      pressDown(game);
      if (game.state.player.airTrick) {
        starts.push(k);
        expect(GROUND_Y - game.state.player.y, `press at tick ${k}`).toBeGreaterThanOrEqual(AIR_TRICK_HEIGHT);
      }
    }
    expect(starts.length).toBeGreaterThanOrEqual(6);
  });

  it('a second press during the trick does not restart it; after it, another may start if there is time', () => {
    const game = createPlayerTestGame();
    launch(game, 700); // a very long flight
    tick(game, 2);
    pressDown(game);
    tick(game, 5);
    pressDown(game);
    let ticksOn = 1 + 5 + 1;
    while (game.state.player.airTrick) {
      tick(game);
      ticksOn++;
    }
    expect(ticksOn - 1).toBe(AIR_TRICK_TICKS);
    pressDown(game);
    expect(game.state.player.airTrick).toBe(true);
  });

  it('holding down through the air never ducks: tucked hitbox, then a normal landing', () => {
    const game = createPlayerTestGame();
    launch(game, 360);
    tick(game, 2);
    game.buttons.duck.press('test');
    for (let i = 0; i < 120 && !game.state.player.grounded; i++) {
      tick(game);
      if (!game.state.player.grounded) {
        expect(game.state.player.state).not.toBe('duck');
        expect(game.state.player.hitbox.h).toBe(HITBOX_H.tucked);
      }
    }
    expect(game.state.player.grounded).toBe(true);
  });
});

/** Street jump: action held `hold` ticks (Infinity: the whole jump), down pressed before tick `pressAt` of the flight. */
function streetJump(hold: number, pressAt: number | null): { flight: Sample[]; lands: number[] } {
  const game = createPlayerTestGame();
  const lands: number[] = [];
  game.bus.on('land', (e) => lands.push(e.impact));
  tick(game, 3);
  game.buttons.action.press('test');
  const flight = fly(game, (i) => {
    if (i === hold) game.buttons.action.release('test');
    if (i === pressAt) game.buttons.duck.press('test');
    if (pressAt !== null && i === pressAt + 1) game.buttons.duck.release('test');
  });
  return { flight, lands };
}

/** Flight ticks at which a down press starts the trick on a street jump with `hold`. */
function streetStarts(hold: number): number[] {
  const starts: number[] = [];
  for (let k = 0; k < 60; k++) if (streetJump(hold, k).flight[k]?.airTrick) starts.push(k);
  return starts;
}

describe('street kickflip window', () => {
  it('a full-hold street jump allows the start over most of the flight (>= 25 ticks)', () => {
    const starts = streetStarts(Infinity);
    expect(starts.length).toBeGreaterThanOrEqual(25);
    // One contiguous window, ending a few ticks before the landing.
    expect(starts.at(-1)! - starts[0]! + 1).toBe(starts.length);
    expect(streetJump(Infinity, null).flight.length - starts.at(-1)!).toBeLessThanOrEqual(10);
  });

  it('medium street jumps (10- and 15-tick hold) leave a fair window (>= 10 ticks)', () => {
    expect(streetStarts(10).length).toBeGreaterThanOrEqual(10);
    expect(streetStarts(15).length).toBeGreaterThanOrEqual(10);
  });

  it('is shorter than the launch kickflip', () => {
    expect(STREET_AIR_TRICK_TICKS).toBeLessThan(AIR_TRICK_TICKS);
    const first = streetStarts(Infinity)[0]!;
    const flight = streetJump(Infinity, first).flight;
    const on = flight.flatMap((s, i) => (s.airTrick ? [i] : []));
    expect(on).toEqual(Array.from({ length: STREET_AIR_TRICK_TICKS }, (_, k) => first + k));
  });

  it('a trick started late ends on the landing tick with the same flight and landing as without it', () => {
    const plain = streetJump(Infinity, null);
    const last = streetStarts(Infinity).at(-1)!;
    const late = streetJump(Infinity, last);
    // Still running the tick before touching down: the landing cuts it short.
    expect(late.flight.at(-2)!.airTrick).toBe(true);
    const landing = late.flight.at(-1)!;
    expect(landing.grounded).toBe(true);
    expect(landing.airTrick).toBe(false);
    expect(landing.state).not.toBe('crash');
    const physics = (f: Sample[]) => f.map(({ y, vy, grounded, state }) => ({ y, vy, grounded, crash: state === 'crash' }));
    expect(physics(late.flight)).toEqual(physics(plain.flight));
    expect(late.lands).toEqual(plain.lands);
  });
});

describe('canStartAirTrick (pure rule)', () => {
  it('a launch needs the full trick air time, a street jump only the height and STREET_AIR_TRICK_MIN_AIR', () => {
    const y = GROUND_Y - 30;
    // Falling from rest 30 px up: about 13 ticks of air left.
    const left = airTicksLeft(y, 0);
    expect(left).toBeGreaterThanOrEqual(STREET_AIR_TRICK_MIN_AIR);
    expect(left).toBeLessThan(AIR_TRICK_TICKS);
    expect(canStartAirTrick(y, 0, false)).toBe(true);
    expect(canStartAirTrick(y, 0, true)).toBe(false);
    expect(canStartAirTrick(GROUND_Y - AIR_TRICK_HEIGHT + 1, -200, false)).toBe(false);
    expect(canStartAirTrick(GROUND_Y - 10, -400, true)).toBe(true);
    expect(airTrickTicks(true)).toBe(AIR_TRICK_TICKS);
    expect(airTrickTicks(false)).toBe(STREET_AIR_TRICK_TICKS);
  });
});

describe('air trick never changes the physics', () => {
  it('the flight and the landing are identical with and without the trick', () => {
    for (const v of LAUNCHES) {
      const lands: number[][] = [[], []];
      const flights = [null, 1].map((pressAt, n) => {
        const game = createPlayerTestGame();
        game.bus.on('land', (e) => lands[n]!.push(e.impact));
        tick(game, 3);
        launch(game, v);
        return fly(game, (i) => {
          if (i === pressAt) game.buttons.duck.press('test');
          if (pressAt !== null && i === pressAt + 1) game.buttons.duck.release('test');
        });
      });
      const [plain, trick] = flights;
      expect(trick!.some((s) => s.airTrick)).toBe(true);
      expect(trick!.map(({ y, vy, grounded }) => ({ y, vy, grounded }))).toEqual(plain!.map(({ y, vy, grounded }) => ({ y, vy, grounded })));
      expect(lands[1]).toEqual(lands[0]);
    }
  });
});

describe('air trick ends', () => {
  it('on a crash, on a rail or ledge catch and at a run start; never set while supported', () => {
    const crashed = createPlayerTestGame();
    launch(crashed);
    tick(crashed, 2);
    pressDown(crashed);
    crash(crashed);
    tick(crashed);
    expect(crashed.state.player.airTrick).toBe(false);

    const caught = createPlayerTestGame();
    launch(caught);
    tick(caught, 2);
    pressDown(caught);
    const ledge = addRail(caught, { x: PLAYER_X - 20, y: caught.state.player.y, w: 300, h: 4 }, 'ledge');
    startGrind(caught, ledge);
    expect(caught.state.player.airTrick).toBe(false);
    tick(caught);
    expect(caught.state.player.airTrick).toBe(false);

    const restarted = createPlayerTestGame();
    launch(restarted);
    tick(restarted, 2);
    pressDown(restarted);
    restarted.commands.gameOver();
    restarted.commands.startRun();
    expect(restarted.state.player.airTrick).toBe(false);
  });
});

describe('air trick look', () => {
  it('shows the kickflip timeline while it runs, over the grab', () => {
    const game = createPlayerTestGame();
    launch(game);
    tick(game, 2);
    pressDown(game);
    const view = playerController(game).view(game.state.player);
    expect(view.airTrick).toBe(0);
    expect(timelineFor(view, game.state.player.vy)).toBe('kickflip');
    tick(game, 3);
    // The launch kickflip plays the street flip timeline slower, over its longer run.
    expect(playerController(game).view(game.state.player).airTrick).toBeCloseTo((3 * TICK_DT * STREET_AIR_TRICK_TICKS) / AIR_TRICK_TICKS, 9);
  });

  it('flips the board through every flip frame within the first STREET_AIR_TRICK_MIN_AIR + 1 ticks of a street kickflip', () => {
    const game = createPlayerTestGame();
    tick(game, 3);
    game.buttons.action.press('test');
    while (!playerController(game).view(game.state.player).airTrick && !game.state.player.airTrick) pressDown(game);
    const boards = new Set<number>();
    for (let i = 0; i <= STREET_AIR_TRICK_MIN_AIR; i++) {
      const view = playerController(game).view(game.state.player);
      boards.add(poseAt('kickflip', view.airTrick!).board);
      tick(game);
    }
    for (const frame of [BD.edgeGrip, BD.upsideDown, BD.edgeBottom]) expect(boards.has(frame), `board ${frame}`).toBe(true);
    // Over the whole trick it ends caught flat under the feet.
    expect(poseAt('kickflip', (STREET_AIR_TRICK_TICKS - 1) * TICK_DT).board).toBe(BD.flat);
  });
});
