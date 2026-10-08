import { describe, expect, it } from 'vitest';
import { GROUND_Y, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { timelineFor } from './poses';
import { addRail, crash, createPlayerTestGame, jumpApex, playerController, startGrind, tick } from './testing';
import { GRAB_HEIGHT, GRAB_RELEASE_HEIGHT, GRAVITY, HARD_LANDING_IMPACT, KICKER_WHEEL_REACH } from './tuning';

/** A kicker launch like gameplay's for a ~50 px stunt jump. */
const VELOCITY = 360;

/** What gameplay does when the skater rides onto a kicker. */
function launch(game: Game, velocity = VELOCITY): void {
  game.bus.emit('launch', { entityId: 5, velocity });
}

/** Ticks until the skater is supported again; returns the apex height above the start and every y. */
function flight(game: Game): { apex: number; ys: number[] } {
  const startY = game.state.player.y;
  const ys: number[] = [];
  for (let i = 0; i < 240; i++) {
    tick(game);
    ys.push(game.state.player.y);
    if (game.state.player.grounded || game.state.player.grinding) break;
  }
  return { apex: startY - Math.min(...ys), ys };
}

function view(game: Game) {
  return playerController(game).view(game.state.player);
}

describe('kicker launch', () => {
  it('does not move the skater in the tick the launch arrives (gameplay runs after the player)', () => {
    const game = createPlayerTestGame();
    tick(game, 3);
    launch(game);
    expect(game.state.player.grounded).toBe(true);
    expect(game.state.player.vy).toBe(0);
  });

  it('takes off on the next tick with -velocity, integrated like a jump take-off without hold', () => {
    const game = createPlayerTestGame();
    tick(game, 3);
    launch(game);
    tick(game);
    const vy = -VELOCITY + GRAVITY * TICK_DT;
    const p = game.state.player;
    expect(p.vy).toBeCloseTo(vy, 9);
    expect(p.y).toBeCloseTo(GROUND_Y + vy * TICK_DT, 9);
    expect(p.grounded).toBe(false);
  });

  it('reaches about velocity^2 / (2 * GRAVITY) above the street', () => {
    const game = createPlayerTestGame();
    launch(game);
    const { apex } = flight(game);
    expect(apex).toBeGreaterThan((VELOCITY * VELOCITY) / (2 * GRAVITY) - 3);
    expect(apex).toBeLessThan((VELOCITY * VELOCITY) / (2 * GRAVITY) + 1);
  });

  it('holding the action adds no height (no hold boost on a launch)', () => {
    const free = createPlayerTestGame();
    launch(free);
    const released = flight(free).ys;

    const held = createPlayerTestGame();
    held.buttons.action.press('test');
    tick(held); // the press jumps from the ground
    held.buttons.action.release('test');
    tick(held);
    held.buttons.action.press('test'); // held again through the whole launch
    for (let i = 0; i < 240 && !held.state.player.grounded; i++) tick(held);
    tick(held, 10);
    launch(held);
    expect(flight(held).ys).toEqual(released);
  });

  it('a launch mid-jump replaces the jump and ends its hold boost', () => {
    const game = createPlayerTestGame();
    game.buttons.action.press('test');
    tick(game, 3);
    launch(game);
    tick(game);
    expect(game.state.player.vy).toBeCloseTo(-VELOCITY + GRAVITY * TICK_DT, 9);
    tick(game);
    expect(game.state.player.vy).toBeCloseTo(-VELOCITY + 2 * GRAVITY * TICK_DT, 9);
  });

  it('a press in the take-off tick does not jump on top of the launch', () => {
    const game = createPlayerTestGame();
    const jumps: unknown[] = [];
    game.bus.on('jump', (e) => jumps.push(e));
    launch(game);
    game.buttons.action.press('test');
    tick(game);
    expect(jumps).toHaveLength(0);
    expect(game.state.player.vy).toBeCloseTo(-VELOCITY + GRAVITY * TICK_DT, 9);
  });

  it('emits no jump event and lands by the normal rules', () => {
    const game = createPlayerTestGame();
    const jumps: unknown[] = [];
    const lands: { impact: number }[] = [];
    game.bus.on('jump', (e) => jumps.push(e));
    game.bus.on('land', (e) => lands.push(e));
    launch(game);
    flight(game);
    expect(jumps).toHaveLength(0);
    expect(lands).toHaveLength(1);
    expect(game.state.player.y).toBe(GROUND_Y);
  });

  it('is ignored while the crash animation plays, dropped by a crash and cleared by a run start', () => {
    const crashing = createPlayerTestGame();
    crash(crashing);
    const vy = crashing.state.player.vy;
    launch(crashing);
    tick(crashing);
    expect(crashing.state.player.vy).toBeCloseTo(vy + GRAVITY * TICK_DT, 9);

    const dropped = createPlayerTestGame();
    launch(dropped);
    crash(dropped);
    tick(dropped);
    expect(dropped.state.player.vy).toBeGreaterThan(-VELOCITY + 2 * GRAVITY * TICK_DT);

    const restarted = createPlayerTestGame();
    launch(restarted);
    restarted.commands.gameOver();
    restarted.commands.startRun();
    tick(restarted);
    expect(restarted.state.player.grounded).toBe(true);
  });

  it('launches only once per event', () => {
    const game = createPlayerTestGame();
    launch(game);
    tick(game, 2);
    expect(game.state.player.vy).toBeCloseTo(-VELOCITY + 2 * GRAVITY * TICK_DT, 9);
  });
});

describe('grab pose (big air)', () => {
  it('grabs the board after a launch and lets go before touching down', () => {
    const game = createPlayerTestGame();
    launch(game);
    tick(game);
    expect(view(game).grab).toBe(true);
    expect(timelineFor(view(game), game.state.player.vy)).toBe('grab');
    let released = false;
    for (let i = 0; i < 240 && !game.state.player.grounded; i++) {
      tick(game);
      const p = game.state.player;
      if (!p.grounded && p.vy > 0 && GROUND_Y - p.y < GRAB_RELEASE_HEIGHT) {
        expect(view(game).grab).toBe(false);
        released = true;
      }
    }
    expect(released).toBe(true);
    expect(view(game).grab).toBe(false);
  });

  it('a tap jump never grabs, a full-hold jump grabs once it rises past GRAB_HEIGHT', () => {
    const tap = createPlayerTestGame();
    tap.buttons.action.press('test');
    tick(tap, 2);
    tap.buttons.action.release('test');
    for (let i = 0; i < 120 && !tap.state.player.grounded; i++) {
      tick(tap);
      expect(view(tap).grab).toBe(false);
    }

    const high = createPlayerTestGame();
    high.buttons.action.press('test');
    let grabbed = false;
    for (let i = 0; i < 120; i++) {
      tick(high);
      const p = high.state.player;
      if (GROUND_Y - p.y < GRAB_HEIGHT && p.vy < 0) expect(view(high).grab).toBe(false);
      if (view(high).grab) grabbed = true;
      if (p.grounded && i > 5) break;
    }
    expect(grabbed).toBe(true);
  });

  it('lets go when the skater lands on a rail or crashes', () => {
    const game = createPlayerTestGame();
    launch(game);
    tick(game, 4);
    expect(view(game).grab).toBe(true);
    const ledge = addRail(game, { x: 0, y: game.state.player.y, w: 300, h: 4 }, 'ledge');
    startGrind(game, ledge);
    tick(game);
    expect(view(game).grab).toBe(false);

    const crashed = createPlayerTestGame();
    launch(crashed);
    tick(crashed, 4);
    crash(crashed);
    tick(crashed);
    expect(view(crashed).grab).toBe(false);
  });
});

describe('high ledge (upper level)', () => {
  const HEIGHT = 50;

  /** Grinds a ledge HEIGHT px above the street that scrolls left; returns it. */
  function grindLedge(game: Game) {
    const ledge = addRail(game, { x: game.state.player.x - 20, y: GROUND_Y - HEIGHT, w: 60, h: 6 }, 'ledge');
    startGrind(game, ledge);
    return ledge;
  }

  it('grinds at the ledge entity y like a rail', () => {
    const game = createPlayerTestGame();
    const ledge = grindLedge(game);
    tick(game, 5);
    const p = game.state.player;
    expect(p.grinding).toBe(true);
    expect(p.y).toBe(ledge.y);
    expect(p.state).toBe('grind');
  });

  it('leaving its end drops to the street with a normal landing: impact from the fall height, no crash', () => {
    const game = createPlayerTestGame();
    const ledge = grindLedge(game);
    const crashes: unknown[] = [];
    const lands: { impact: number }[] = [];
    const ends: unknown[] = [];
    game.bus.on('crash', (e) => crashes.push(e));
    game.bus.on('land', (e) => lands.push(e));
    game.bus.on('grindEnd', (e) => ends.push(e));
    const health = game.state.health;
    for (let i = 0; i < 240 && !game.state.player.grounded; i++) {
      ledge.x -= 2;
      tick(game);
    }
    expect(ends).toHaveLength(1);
    expect(crashes).toHaveLength(0);
    expect(game.state.health).toBe(health);
    expect(lands).toHaveLength(1);
    expect(lands[0]!.impact).toBeGreaterThan(Math.sqrt(2 * GRAVITY * HEIGHT) - 25);
    expect(lands[0]!.impact).toBeLessThan(Math.sqrt(2 * GRAVITY * HEIGHT) + 25);
    expect(game.state.player.y).toBe(GROUND_Y);
    expect(game.state.player.state).toBe('land');
    expect(view(game).hardLanding).toBe(true);
    expect(timelineFor(view(game), 0)).toBe('hardLand');
  });

  it('a drop of more than 30 px lands hard, a 25 px drop does not', () => {
    for (const [height, hard] of [[31, true], [25, false]] as const) {
      const game = createPlayerTestGame();
      const ledge = addRail(game, { x: game.state.player.x - 20, y: GROUND_Y - height, w: 60, h: 4 }, 'ledge');
      startGrind(game, ledge);
      tick(game);
      ledge.x = -200;
      for (let i = 0; i < 120 && !game.state.player.grounded; i++) tick(game);
      expect(view(game).hardLanding, `drop ${height}`).toBe(hard);
    }
  });

  it('a normal tap landing is no hard landing', () => {
    const game = createPlayerTestGame();
    const lands: { impact: number }[] = [];
    game.bus.on('land', (e) => lands.push(e));
    jumpApex(game, 2);
    expect(lands[0]!.impact).toBeLessThan(HARD_LANDING_IMPACT);
    expect(view(game).hardLanding).toBe(false);
    expect(timelineFor(view(game), 0)).toBe('land');
  });
});

describe('kicker ride-up look', () => {
  it('tilts the board while rolling over a kicker on the street, not elsewhere', () => {
    const game = createPlayerTestGame();
    tick(game);
    expect(view(game).onKicker).toBe(false);
    const kicker = addRail(game, { x: game.state.player.x - 4, y: GROUND_Y - 8, w: 16, h: 8 }, 'kicker');
    tick(game);
    expect(view(game).onKicker).toBe(true);
    expect(timelineFor(view(game), 0)).toBe('kicker');
    kicker.x = game.state.player.x + 30;
    tick(game);
    expect(view(game).onKicker).toBe(false);
  });

  it('lifts the skater with the ramp surface under the front wheel (look only), from its low end to its lip', () => {
    const game = createPlayerTestGame();
    tick(game);
    expect(view(game).kickerLift).toBe(0);
    const x = game.state.player.x;
    const kicker = addRail(game, { x: x + 30, y: GROUND_Y - 7, w: 18, h: 7 }, 'kicker');
    tick(game);
    expect(view(game).kickerLift).toBe(0);
    const lifts: number[] = [];
    for (let dx = -KICKER_WHEEL_REACH; dx <= 18; dx += 2) {
      kicker.x = x - dx;
      tick(game);
      lifts.push(view(game).kickerLift);
      expect(game.state.player.y).toBe(GROUND_Y);
    }
    expect(lifts[0]).toBe(0);
    expect(lifts[Math.ceil(KICKER_WHEEL_REACH / 2)]!).toBeGreaterThan(0); // the front wheel is up the ramp already
    expect(lifts.at(-1)).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < lifts.length; i++) expect(lifts[i]!).toBeGreaterThanOrEqual(lifts[i - 1]!);
    kicker.x = x + 30;
    tick(game);
    expect(view(game).kickerLift).toBe(0);
  });
});
