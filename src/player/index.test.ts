import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import { Game } from '../core/game';
import type { GameEvents } from '../types';
import { createPlayerSystem } from './index';
import { addRail, crash, createPlayerTestGame, jumpApex, playerController, startGrind, tick } from './testing';
import { CRASH_TIME, HITBOX_W, INVULNERABLE_TIME } from './tuning';

function record<K extends keyof GameEvents>(game: Game, name: K): GameEvents[K][] {
  const seen: GameEvents[K][] = [];
  game.bus.on(name, (e) => seen.push(e));
  return seen;
}

/** Puts the player on a long rail 30 px above the ground. */
function grindingGame() {
  const game = createPlayerTestGame();
  tick(game, 5);
  const rail = addRail(game, { x: PLAYER_X - 10, y: GROUND_Y - 30, w: 200, h: 4 });
  startGrind(game, rail);
  return { game, rail };
}

describe('variable jump', () => {
  it('a tap clears a 14 px obstacle but stays a small ollie', () => {
    const tap = jumpApex(createPlayerTestGame(), 2);
    expect(tap).toBeGreaterThan(14);
    expect(tap).toBeLessThan(22);
  });

  it('a full hold jumps at least 2.5x as high as a tap and clears 35 px', () => {
    const tap = jumpApex(createPlayerTestGame(), 2);
    const hold = jumpApex(createPlayerTestGame(), 60);
    expect(hold).toBeGreaterThanOrEqual(tap * 2.5);
    expect(hold).toBeGreaterThan(40);
  });

  it('stops adding height after the maximum hold time', () => {
    expect(jumpApex(createPlayerTestGame(), 120)).toBe(jumpApex(createPlayerTestGame(), 30));
  });

  it('lands back exactly on the ground and emits jump and land', () => {
    const game = createPlayerTestGame();
    const jumps = record(game, 'jump');
    const lands = record(game, 'land');
    jumpApex(game, 2);
    expect(game.state.player.y).toBe(GROUND_Y);
    expect(game.state.player.grounded).toBe(true);
    expect(jumps).toHaveLength(1);
    expect(lands).toHaveLength(1);
    expect(lands[0]!.impact).toBeGreaterThan(0);
  });

  it('does not jump on the title screen', () => {
    const game = new Game({ systems: [createPlayerSystem()] });
    game.buttons.action.press('test');
    game.tick();
    expect(game.state.player.y).toBe(GROUND_Y);
  });

  it('does not jump again while airborne without a buffer window', () => {
    const game = createPlayerTestGame();
    const jumps = record(game, 'jump');
    game.buttons.action.press('test');
    tick(game, 2);
    game.buttons.action.release('test');
    tick(game, 3);
    game.buttons.action.press('test'); // far from landing: no double jump
    tick(game, 2);
    expect(jumps).toHaveLength(1);
  });
});

describe('jump buffer', () => {
  /** Ticks of a tap jump in the air, measured. */
  function airTicks(): number {
    const game = createPlayerTestGame();
    game.buttons.action.press('test');
    let ticks = 0;
    do {
      if (ticks === 2) game.buttons.action.release('test');
      game.tick();
      ticks++;
    } while (!game.state.player.grounded);
    return ticks;
  }

  function jumpsWithEarlyPress(ticksBeforeLanding: number): number {
    const game = createPlayerTestGame();
    const jumps = record(game, 'jump');
    const total = airTicks();
    game.buttons.action.press('test');
    tick(game, 2);
    game.buttons.action.release('test');
    tick(game, total - 2 - ticksBeforeLanding);
    game.buttons.action.press('test');
    tick(game, 1);
    game.buttons.action.release('test');
    tick(game, ticksBeforeLanding + 3);
    return jumps.length;
  }

  it('jumps on touch-down when pressed up to ~120 ms before landing', () => {
    expect(jumpsWithEarlyPress(6)).toBe(2);
  });

  it('forgets a press made much earlier than 120 ms before landing', () => {
    expect(jumpsWithEarlyPress(12)).toBe(1);
  });
});

describe('coyote time', () => {
  function jumpsAfterRailEnd(ticksAfterEnd: number): number {
    const { game, rail } = grindingGame();
    const jumps = record(game, 'jump');
    tick(game, 3);
    rail.x = PLAYER_X - rail.w - 1; // the rail has scrolled past the player
    tick(game, 1 + ticksAfterEnd);
    game.buttons.action.press('test');
    tick(game, 1);
    return jumps.length;
  }

  it('still jumps within ~80 ms after rolling off a rail end', () => {
    expect(jumpsAfterRailEnd(3)).toBe(1);
  });

  it('does not jump once the coyote time is over', () => {
    expect(jumpsAfterRailEnd(7)).toBe(0);
  });
});

describe('grind contract', () => {
  it('rides on the rail top without gravity in the grind pose', () => {
    const { game, rail } = grindingGame();
    tick(game, 30);
    const p = game.state.player;
    expect(p.grinding).toBe(true);
    expect(p.grounded).toBe(false);
    expect(p.y).toBe(rail.y);
    expect(p.vy).toBe(0);
    expect(p.state).toBe('grind');
  });

  it('jumps off the rail with the same variable jump and reports grindEnd', () => {
    const tapOnGround = jumpApex(createPlayerTestGame(), 2);
    const { game, rail } = grindingGame();
    const ends = record(game, 'grindEnd');
    tick(game, 10);
    const tap = jumpApex(game, 2);
    expect(tap).toBeCloseTo(tapOnGround, 5);
    expect(ends).toEqual([{ entityId: rail.id, ticks: 10 }]);
    expect(game.state.player.grinding).toBe(false);

    const second = grindingGame();
    expect(jumpApex(second.game, 60)).toBeGreaterThanOrEqual(tap * 2.5);
  });

  it('falls off when the rail ends and lands on the ground', () => {
    const { game, rail } = grindingGame();
    const ends = record(game, 'grindEnd');
    tick(game, 5);
    rail.x = PLAYER_X - rail.w - 1;
    tick(game, 1);
    expect(game.state.player.grinding).toBe(false);
    expect(ends).toHaveLength(1);
    tick(game, 60);
    expect(game.state.player.grounded).toBe(true);
    expect(game.state.player.y).toBe(GROUND_Y);
  });

  it('falls off when the rail entity disappears', () => {
    const { game } = grindingGame();
    const ends = record(game, 'grindEnd');
    game.state.entities.length = 0;
    tick(game, 1);
    expect(game.state.player.grinding).toBe(false);
    expect(ends).toHaveLength(1);
  });

  it('leaves the rail without a second grindEnd when gameplay ends the grind', () => {
    const { game, rail } = grindingGame();
    const ends = record(game, 'grindEnd');
    tick(game, 5);
    game.bus.emit('grindEnd', { entityId: rail.id, ticks: 5 });
    tick(game, 1);
    expect(game.state.player.grinding).toBe(false);
    expect(ends).toHaveLength(1);
  });

  it('ignores grindStart for an unknown entity', () => {
    const game = createPlayerTestGame();
    game.bus.emit('grindStart', { entityId: 4242 });
    tick(game, 1);
    expect(game.state.player.grinding).toBe(false);
  });
});

describe('crash contract', () => {
  it('plays the crash, gets back up and stays invulnerable for ~1.5 s', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    crash(game);
    tick(game, 1);
    expect(game.state.player.state).toBe('crash');
    expect(game.state.player.invulnerableTimer).toBeGreaterThan(INVULNERABLE_TIME - 0.05);

    tick(game, Math.ceil(CRASH_TIME * 60) + 1);
    expect(game.state.player.state).not.toBe('crash');
    expect(game.state.player.grounded).toBe(true);
    expect(game.state.player.invulnerableTimer).toBeGreaterThan(0);

    tick(game, Math.ceil((INVULNERABLE_TIME - CRASH_TIME) * 60) + 1);
    expect(game.state.player.invulnerableTimer).toBe(0);
  });

  it('a kickflip bail (kind bail, entityId -1) throws the skater off like an obstacle crash', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    game.state.health -= 1;
    game.bus.emit('crash', { entityId: -1, kind: 'bail', health: game.state.health });
    expect(game.state.player.grounded).toBe(false);
    expect(game.state.player.vy).toBeLessThan(0);
    tick(game, 1);
    expect(game.state.player.state).toBe('crash');
    expect(playerController(game).view(game.state.player).binCrash).toBe(false);
    expect(game.state.player.invulnerableTimer).toBeGreaterThan(INVULNERABLE_TIME - 0.05);
    tick(game, Math.ceil(CRASH_TIME * 60) + 1);
    expect(game.state.player.state).not.toBe('crash');
    expect(game.state.player.grounded).toBe(true);
  });

  it('ignores further crashes while invulnerable', () => {
    const game = createPlayerTestGame();
    crash(game);
    tick(game, 30);
    const timer = game.state.player.invulnerableTimer;
    crash(game);
    tick(game, 1);
    expect(game.state.player.invulnerableTimer).toBeLessThan(timer);
  });

  it('can crash again once invulnerability is over', () => {
    const game = createPlayerTestGame();
    crash(game);
    tick(game, Math.ceil(INVULNERABLE_TIME * 60) + 2);
    crash(game);
    tick(game, 1);
    expect(game.state.player.state).toBe('crash');
  });

  it('ignores the action while stumbling', () => {
    const game = createPlayerTestGame();
    crash(game);
    tick(game, 40);
    const jumps = record(game, 'jump');
    game.buttons.action.press('test');
    tick(game, 2);
    expect(jumps).toHaveLength(0);
  });

  it('knocks the player off a rail and ends the grind', () => {
    const { game } = grindingGame();
    const ends = record(game, 'grindEnd');
    crash(game);
    expect(game.state.player.grinding).toBe(false);
    expect(ends).toHaveLength(1);
    tick(game, 60);
    expect(game.state.player.y).toBe(GROUND_Y);
  });

  it('ignores grindStart while crashing', () => {
    const game = createPlayerTestGame();
    crash(game);
    const rail = addRail(game, { x: PLAYER_X - 10, y: GROUND_Y - 20, w: 100, h: 4 });
    startGrind(game, rail);
    expect(game.state.player.grinding).toBe(false);
  });
});

describe('animation states', () => {
  it('goes jump -> air -> land -> ride/push around a jump', () => {
    const game = createPlayerTestGame();
    const seen: string[] = [];
    game.buttons.action.press('test');
    for (let i = 0; i < 90; i++) {
      if (i === 2) game.buttons.action.release('test');
      game.tick();
      const s = game.state.player.state;
      if (seen[seen.length - 1] !== s) seen.push(s);
    }
    expect(seen.slice(0, 3)).toEqual(['jump', 'air', 'land']);
    expect(['ride', 'push']).toContain(seen[3]);
  });

  it('alternates pushing and cruising on the ground', () => {
    const game = createPlayerTestGame();
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 5; i++) {
      game.tick();
      seen.add(game.state.player.state);
    }
    expect(seen).toEqual(new Set(['push', 'ride']));
  });
});

describe('hitbox', () => {
  it('covers the body above the wheels, narrower than the board', () => {
    const game = createPlayerTestGame();
    tick(game, 1);
    const { hitbox: h, x, y } = game.state.player;
    expect(h.w).toBe(HITBOX_W);
    expect(h.x + h.w / 2).toBe(x);
    expect(h.y + h.h).toBe(y);
    expect(h.h).toBeGreaterThanOrEqual(26);
    expect(h.h).toBeLessThanOrEqual(32);
  });

  it('follows the player in the air and is shorter in the tuck', () => {
    const game = createPlayerTestGame();
    tick(game, 1);
    const standing = game.state.player.hitbox.h;
    game.buttons.action.press('test');
    tick(game, 15);
    const p = game.state.player;
    expect(p.state).toBe('air');
    expect(p.hitbox.y + p.hitbox.h).toBe(p.y);
    expect(p.hitbox.h).toBeLessThan(standing);
  });
});

describe('run reset', () => {
  it('a new run starts clean even after a crash on a rail', () => {
    const { game } = grindingGame();
    crash(game);
    game.commands.gameOver();
    game.commands.startRun();
    tick(game, 1);
    const p = game.state.player;
    expect(p.grinding).toBe(false);
    expect(p.invulnerableTimer).toBe(0);
    expect(['ride', 'push']).toContain(p.state);
  });
});
