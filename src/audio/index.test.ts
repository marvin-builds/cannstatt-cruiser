import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { createStore } from '../core/storage';
import type { AudioBackend, Cue, LoopName } from './backend';
import { createAudioSystem } from './index';
import { GLUG_LENGTH } from './sounds';
import { TRAFFIC, isTrafficCue } from './traffic';

class FakeBackend implements AudioBackend {
  calls: string[] = [];
  played: { cue: Cue; intensity: number; delay: number }[] = [];
  loops = new Set<LoopName>();
  traffic: number[] = [];
  muted = false;
  unlock(): void {
    this.calls.push('unlock');
  }
  play(cue: Cue, intensity: number, delay = 0): void {
    this.played.push({ cue, intensity, delay });
  }
  setTraffic(level: number): void {
    this.traffic.push(level);
  }
  startLoop(loop: LoopName): void {
    this.loops.add(loop);
  }
  stopLoop(loop: LoopName): void {
    this.loops.delete(loop);
  }
  setMuted(muted: boolean): void {
    this.muted = muted;
  }
}

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

function setup(storage = new MemoryStorage()) {
  const backend = new FakeBackend();
  const store = createStore(storage as unknown as Storage);
  const game = new Game({ systems: [createAudioSystem({ backend, store })] });
  return { game, backend, storage, cues: () => backend.played.map((p) => p.cue) };
}

function playing() {
  const s = setup();
  s.game.commands.startRun();
  return s;
}

describe('audio system: event to sound mapping', () => {
  it.each([
    ['jump', { velocity: 250 }, 'jump'],
    ['land', { impact: 200 }, 'land'],
    ['starCollected', { entityId: 1, stars: 3 }, 'star'],
    ['crash', { entityId: 1, kind: 'bin', health: 2 }, 'crash'],
    ['chillStart', { entityId: 1, duration: 8 }, 'chill'],
  ] as const)('%s plays %s', (event, payload, cue) => {
    const { game, cues } = playing();
    game.bus.emit(event, payload as never);
    expect(cues()).toEqual([cue]);
  });

  it('plays the game-over jingle when the run ends', () => {
    const { game, cues } = playing();
    game.commands.gameOver();
    expect(cues()).toContain('gameOver');
  });

  it('scales the landing thud with the impact', () => {
    const { game, backend } = playing();
    game.bus.emit('land', { impact: 80 });
    game.bus.emit('land', { impact: 400 });
    const [soft, hard] = backend.played.map((p) => p.intensity);
    expect(soft).toBeLessThan(hard!);
    expect(hard).toBeLessThanOrEqual(1);
    expect(soft).toBeGreaterThan(0);
  });

  it('adds a boost sound once when the jump is held while rising', () => {
    const { game, cues } = playing();
    game.buttons.action.press('test');
    game.bus.emit('jump', { velocity: 250 });
    game.state.player.grounded = false;
    game.state.player.vy = -200;
    for (let i = 0; i < 20; i++) game.tick();
    expect(cues().filter((c) => c === 'boost')).toHaveLength(1);
  });

  it('plays no boost for a short tap', () => {
    const { game, cues } = playing();
    game.buttons.action.press('test');
    game.bus.emit('jump', { velocity: 250 });
    game.state.player.grounded = false;
    game.state.player.vy = -200;
    game.tick();
    game.buttons.action.release('test');
    for (let i = 0; i < 20; i++) game.tick();
    expect(cues()).not.toContain('boost');
  });
});

describe('audio system: grind loop', () => {
  it('starts on grindStart and stops on grindEnd', () => {
    const { game, backend } = playing();
    game.bus.emit('grindStart', { entityId: 4 });
    expect(backend.loops.has('grind')).toBe(true);
    game.bus.emit('grindEnd', { entityId: 4, ticks: 30 });
    expect(backend.loops.has('grind')).toBe(false);
  });

  it.each(['crash', 'gameOver', 'pause'] as const)('stops on %s', (event) => {
    const { game, backend } = playing();
    game.bus.emit('grindStart', { entityId: 4 });
    if (event === 'crash') game.bus.emit('crash', { entityId: 2, kind: 'bin', health: 1 });
    if (event === 'gameOver') game.commands.gameOver();
    if (event === 'pause') game.commands.pause();
    expect(backend.loops.has('grind')).toBe(false);
  });

  it('resumes the loop after pause while still grinding', () => {
    const { game, backend } = playing();
    game.bus.emit('grindStart', { entityId: 4 });
    game.state.player.grinding = true;
    game.commands.pause();
    game.commands.resume();
    expect(backend.loops.has('grind')).toBe(true);
  });

  it('stops when the game leaves playing without an event (back to title)', () => {
    const { game, backend } = playing();
    game.bus.emit('grindStart', { entityId: 4 });
    game.commands.pause();
    game.commands.resume();
    game.state.mode = 'title';
    game.tick();
    expect(backend.loops.has('grind')).toBe(false);
  });
});

describe('audio system: unlock and mute', () => {
  it('unlocks the backend inside user gestures', () => {
    const { game, backend } = setup();
    game.notifyUserGesture();
    expect(backend.calls).toEqual(['unlock']);
  });

  it('follows the mute event and persists it', () => {
    const { game, backend, storage } = setup();
    game.commands.setMuted(true);
    expect(backend.muted).toBe(true);
    expect(storage.data.get('cannstatt-cruiser:muted')).toBe('true');
    game.commands.setMuted(false);
    expect(backend.muted).toBe(false);
    expect(storage.data.get('cannstatt-cruiser:muted')).toBe('false');
  });

  it('restores a persisted mute into the game state at startup', () => {
    const storage = new MemoryStorage();
    storage.setItem('cannstatt-cruiser:muted', 'true');
    const { game, backend } = setup(storage);
    expect(game.state.muted).toBe(true);
    expect(backend.muted).toBe(true);
  });

  it('starts unmuted without a stored value', () => {
    const { game, backend } = setup();
    expect(game.state.muted).toBe(false);
    expect(backend.muted).toBe(false);
  });
});

describe('audio system: chill', () => {
  it('plays the chill sound on chillStart, inaudible while muted', () => {
    const backend = new FakeBackend();
    const heard: [string, boolean][] = [];
    const game = new Game({
      systems: [createAudioSystem({ backend, store: createStore(null), onSound: (name, muted) => heard.push([name, muted]) })],
    });
    game.commands.startRun();
    game.bus.emit('chillStart', { entityId: 1, duration: 8 });
    game.commands.setMuted(true);
    game.bus.emit('chillStart', { entityId: 2, duration: 8 });
    expect(heard).toEqual([
      ['chill', false],
      ['chill', true],
    ]);
    expect(backend.muted).toBe(true);
  });
});

describe('audio system: kid mode bubble gum', () => {
  function listening(kidMode: boolean) {
    const backend = new FakeBackend();
    const heard: [string, boolean][] = [];
    const game = new Game({
      systems: [createAudioSystem({ backend, store: createStore(null), onSound: (name, muted) => heard.push([name, muted]) })],
    });
    game.state.kidMode = kidMode;
    game.commands.startRun();
    return { game, backend, heard };
  }

  it('plays the sweet bubble sound instead of the chill sound on chillStart in kid mode', () => {
    const { game, heard } = listening(true);
    game.bus.emit('chillStart', { entityId: 1, duration: 6 });
    expect(heard).toEqual([['bubble', false]]);
  });

  it('keeps the mellow chill sound in adult mode', () => {
    const { game, heard } = listening(false);
    game.bus.emit('chillStart', { entityId: 1, duration: 6 });
    expect(heard).toEqual([['chill', false]]);
  });

  it('keeps the bubble sound inaudible while muted', () => {
    const { game, heard, backend } = listening(true);
    game.commands.setMuted(true);
    game.bus.emit('chillStart', { entityId: 1, duration: 6 });
    expect(heard).toEqual([['bubble', true]]);
    expect(backend.muted).toBe(true);
  });

  it('pops the bubble with a little pop when crashing while chewing in kid mode', () => {
    const { game, heard } = listening(true);
    game.state.chillTimer = 3;
    game.bus.emit('crash', { entityId: 1, kind: 'bin', health: 2 });
    expect(heard.map(([name]) => name)).toEqual(['crash', 'pop']);
  });

  it('adds no pop to a crash in adult mode or without chill', () => {
    const adult = listening(false);
    adult.game.state.chillTimer = 3;
    adult.game.bus.emit('crash', { entityId: 1, kind: 'bin', health: 2 });
    const sober = listening(true);
    sober.game.bus.emit('crash', { entityId: 1, kind: 'bin', health: 2 });
    expect(adult.heard.map(([name]) => name)).toEqual(['crash']);
    expect(sober.heard.map(([name]) => name)).toEqual(['crash']);
  });
});

describe('audio system: crashing into people', () => {
  it.each(['vfbFan', 'wasenGuest'] as const)('adds a soft oof when the skater hits a %s', (kind) => {
    const { game, cues } = playing();
    game.bus.emit('crash', { entityId: 1, kind, health: 2 });
    expect(cues()).toEqual(['crash', 'oof']);
  });
});

describe('audio system: robustness', () => {
  it('never lets a failing backend break the game', () => {
    const broken: AudioBackend = {
      unlock: () => {
        throw new Error('no audio');
      },
      play: () => {
        throw new Error('no audio');
      },
      startLoop: () => {
        throw new Error('no audio');
      },
      stopLoop: () => {
        throw new Error('no audio');
      },
      setMuted: () => {
        throw new Error('no audio');
      },
      setTraffic: () => {
        throw new Error('no audio');
      },
    };
    const game = new Game({
      systems: [createAudioSystem({ backend: broken, store: createStore(null) })],
    });
    expect(() => {
      game.notifyUserGesture();
      game.commands.startRun();
      game.bus.emit('jump', { velocity: 250 });
      game.bus.emit('grindStart', { entityId: 1 });
      game.state.trafficDensity = 1;
      game.tick();
      game.commands.setMuted(true);
      game.commands.gameOver();
      game.tick();
    }).not.toThrow();
  });

  it('reports every cue to the debug listener', () => {
    const backend = new FakeBackend();
    const heard: string[] = [];
    const game = new Game({
      systems: [createAudioSystem({ backend, store: createStore(null), onSound: (name) => heard.push(name) })],
    });
    game.commands.startRun();
    game.bus.emit('jump', { velocity: 250 });
    game.bus.emit('grindStart', { entityId: 1 });
    game.bus.emit('grindEnd', { entityId: 1, ticks: 3 });
    expect(heard).toEqual(['jump', 'grind:start', 'grind:stop']);
  });

  it('tells the debug listener whether a cue was muted (logged but inaudible)', () => {
    const backend = new FakeBackend();
    const heard: [string, boolean][] = [];
    const game = new Game({
      systems: [createAudioSystem({ backend, store: createStore(null), onSound: (name, muted) => heard.push([name, muted]) })],
    });
    game.commands.startRun();
    game.bus.emit('jump', { velocity: 250 });
    game.commands.setMuted(true);
    game.bus.emit('starCollected', { entityId: 1, stars: 1 });
    expect(heard).toEqual([
      ['jump', false],
      ['star', true],
    ]);
  });
});

describe('audio system: cleared obstacles', () => {
  it('plays the cleared sound for an ordinary clear by the end of the tick', () => {
    const { game, cues } = playing();
    game.bus.emit('obstacleCleared', { entityId: 1, kind: 'bin', points: 10 });
    game.tick();
    expect(cues()).toEqual(['cleared']);
  });

  it('plays only the bonk and cheer for a ball hit, in either event order', () => {
    for (const ballHitFirst of [false, true]) {
      const { game, cues } = playing();
      if (ballHitFirst) game.bus.emit('ballHit', { entityId: 3, kind: 'vfbFan' });
      game.bus.emit('obstacleCleared', { entityId: 3, kind: 'vfbFan', points: 50 });
      if (!ballHitFirst) game.bus.emit('ballHit', { entityId: 3, kind: 'vfbFan' });
      game.tick();
      expect(cues()).toEqual(['bonk', 'cheer']);
    }
  });

  it('plays only the boing and hoppla for a stomp, in either event order', () => {
    for (const stompFirst of [false, true]) {
      const { game, cues } = playing();
      if (stompFirst) game.bus.emit('stomp', { entityId: 4, kind: 'wasenGuest', item: 'beer' });
      game.bus.emit('obstacleCleared', { entityId: 4, kind: 'wasenGuest', points: 50 });
      if (!stompFirst) game.bus.emit('stomp', { entityId: 4, kind: 'wasenGuest', item: 'beer' });
      game.tick();
      expect(cues()).toEqual(['boing', 'hoppla']);
    }
  });

  it('still plays cleared for another obstacle cleared in the same tick as a ball hit', () => {
    const { game, cues } = playing();
    game.bus.emit('ballHit', { entityId: 3, kind: 'vfbFan' });
    game.bus.emit('obstacleCleared', { entityId: 3, kind: 'vfbFan', points: 50 });
    game.bus.emit('obstacleCleared', { entityId: 5, kind: 'bin', points: 10 });
    game.tick();
    expect(cues()).toEqual(['bonk', 'cheer', 'cleared']);
  });

  it('plays cleared when the same entity clears in a later tick than its ball hit', () => {
    const { game, cues } = playing();
    game.bus.emit('ballHit', { entityId: 3, kind: 'vfbFan' });
    game.tick();
    game.bus.emit('obstacleCleared', { entityId: 3, kind: 'vfbFan', points: 50 });
    game.tick();
    expect(cues()).toEqual(['bonk', 'cheer', 'cleared']);
  });

  it('drops a pending cleared sound when a new run starts', () => {
    const { game, cues } = playing();
    game.bus.emit('obstacleCleared', { entityId: 1, kind: 'bin', points: 10 });
    game.commands.gameOver();
    game.commands.startRun();
    expect(game.state.mode).toBe('playing');
    game.tick();
    expect(cues()).not.toContain('cleared');
  });
});

describe('audio system: stomp and carried items', () => {
  function listening() {
    const backend = new FakeBackend();
    const heard: [string, boolean][] = [];
    const game = new Game({
      systems: [createAudioSystem({ backend, store: createStore(null), onSound: (name, muted) => heard.push([name, muted]) })],
    });
    game.commands.startRun();
    return { game, backend, heard };
  }

  it('plays a boing for the bounce and a hoppla for the stomped person', () => {
    const { game, heard } = listening();
    game.bus.emit('stomp', { entityId: 3, kind: 'wasenGuest', item: 'beer' });
    expect(heard).toEqual([
      ['boing', false],
      ['hoppla', false],
    ]);
  });

  it('plays a cheerful catch jingle when the item is caught', () => {
    const { game, heard } = listening();
    game.bus.emit('itemCaught', { item: 'pretzel' });
    expect(heard).toEqual([['catch', false]]);
  });

  it('keeps the stomp and catch sounds inaudible while muted', () => {
    const { game, heard, backend } = listening();
    game.commands.setMuted(true);
    game.bus.emit('stomp', { entityId: 3, kind: 'vfbFan', item: 'football' });
    game.bus.emit('itemCaught', { item: 'football' });
    expect(heard).toEqual([
      ['boing', true],
      ['hoppla', true],
      ['catch', true],
    ]);
    expect(backend.muted).toBe(true);
  });

  it('uses the same sounds in kid mode', () => {
    const { game, heard } = listening();
    game.state.kidMode = true;
    game.bus.emit('stomp', { entityId: 3, kind: 'vfbFan', item: 'gingerbread' });
    game.bus.emit('itemCaught', { item: 'gingerbread' });
    expect(heard.map(([name]) => name)).toEqual(['boing', 'hoppla', 'catch']);
  });
});

describe('audio system: using items', () => {
  it.each([
    ['beer', 'drink', 'glug'],
    ['pretzel', 'eat', 'munch'],
    ['gingerbread', 'eat', 'munch'],
    ['football', 'throw', 'whoosh'],
  ] as const)('itemUsed %s (%s) plays %s', (item, action, cue) => {
    const { game, cues } = playing();
    game.bus.emit('itemUsed', { item, action });
    expect(cues()).toEqual([cue]);
  });

  it('adds no second whoosh when the ball entity appears', () => {
    const { game, cues } = playing();
    game.bus.emit('itemUsed', { item: 'football', action: 'throw' });
    game.bus.emit('ballThrown', { entityId: 9 });
    expect(cues()).toEqual(['whoosh']);
  });

  it('plays a bonk and a small cheer when the ball hits a person', () => {
    const { game, cues } = playing();
    game.bus.emit('ballHit', { entityId: 3, kind: 'vfbFan' });
    expect(cues()).toEqual(['bonk', 'cheer']);
  });

  it('warns with a rising whistle when the ball comes back', () => {
    const { game, cues } = playing();
    game.bus.emit('ballBack', { entityId: 9 });
    expect(cues()).toEqual(['whistle']);
  });

  it('adds a thud when the ball hits the skater', () => {
    const { game, cues } = playing();
    game.bus.emit('crash', { entityId: 9, kind: 'ball', health: 2 });
    expect(cues()).toEqual(['crash', 'thud']);
  });

  it('plays a heart chime when health is gained', () => {
    const { game, cues } = playing();
    game.bus.emit('healthGained', { health: 3 });
    expect(cues()).toEqual(['heart']);
  });

  it('plays the woozy sting right away when drunk without a drink sound', () => {
    const { game, backend } = playing();
    game.bus.emit('drunkStart', { duration: 6 });
    expect(backend.played).toEqual([{ cue: 'woozy', intensity: 1, delay: 0 }]);
  });

  it('lets the woozy sting wait until the gulps are done', () => {
    const { game, backend } = playing();
    game.bus.emit('itemUsed', { item: 'beer', action: 'drink' });
    game.bus.emit('drunkStart', { duration: 6 });
    const woozy = backend.played.find((p) => p.cue === 'woozy')!;
    expect(woozy.delay).toBeCloseTo(GLUG_LENGTH, 5);
    for (let i = 0; i < 30; i++) game.tick();
    game.bus.emit('drunkStart', { duration: 6 });
    expect(backend.played.at(-1)!.delay).toBeCloseTo(GLUG_LENGTH - 0.5, 1);
  });
});

describe('audio system: grind trick', () => {
  it('plays a trick sting that gets louder with the points', () => {
    const { game, backend } = playing();
    game.bus.emit('grindTrick', { entityId: 1, ticks: 20, points: 10 });
    game.bus.emit('grindTrick', { entityId: 1, ticks: 60, points: 80 });
    const [small, big] = backend.played.filter((p) => p.cue === 'trick').map((p) => p.intensity);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(big!);
    expect(big).toBeLessThanOrEqual(1);
  });

  it('adds a sparkle only for a big trick', () => {
    const { game, cues } = playing();
    game.bus.emit('grindTrick', { entityId: 1, ticks: 20, points: 10 });
    expect(cues()).toEqual(['trick']);
    game.bus.emit('grindTrick', { entityId: 1, ticks: 200, points: 500 });
    expect(cues()).toEqual(['trick', 'trick', 'trickBig']);
  });
});

describe('audio system: Mitte traffic', () => {
  function inTraffic(seconds = 3, density = 1) {
    const s = playing();
    s.game.state.trafficDensity = density;
    for (let i = 0; i < seconds * 60; i++) s.game.tick();
    return s;
  }

  it('fades the rumble in with the density and stays smooth', () => {
    const { backend } = inTraffic();
    expect(backend.traffic[0]).toBeLessThan(0.2);
    expect(backend.traffic.at(-1)).toBeGreaterThan(0.95);
    expect(backend.traffic.length).toBeLessThan(3 * 60);
  });

  it('stays silent outside Mitte', () => {
    const { backend, cues } = inTraffic(10, 0);
    expect(backend.traffic).toEqual([]);
    expect(trafficCues(cues())).toEqual([]);
  });

  it('fades out when leaving Mitte', () => {
    const { game, backend } = inTraffic();
    game.state.trafficDensity = 0;
    for (let i = 0; i < 180; i++) game.tick();
    expect(backend.traffic.at(-1)).toBe(0);
  });

  /** Traffic cues (horns, passing trucks) among the played cues. */
  const trafficCues = (cues: Cue[]) => cues.filter(isTrafficCue);

  it('honks often and varied at high density only', () => {
    const busy = trafficCues(inTraffic(60, 1).cues());
    expect(busy.length).toBeGreaterThan(15);
    expect(new Set(busy).size).toBeGreaterThanOrEqual(3);
    expect(trafficCues(inTraffic(30, 0.3).cues())).toEqual([]);
  });

  it('ducks the rumble under a gameplay sound and brings it back', () => {
    const { game, backend } = inTraffic();
    const full = backend.traffic.at(-1)!;
    game.bus.emit('jump', { velocity: 250 });
    game.tick();
    expect(full).toBeGreaterThan(0.95);
    expect(backend.traffic.at(-1)!).toBeLessThanOrEqual(TRAFFIC.duckTo + 0.001);
    for (let i = 0; i < 60; i++) game.tick();
    expect(backend.traffic.at(-1)!).toBeGreaterThan(0.95);
  });

  it('does not duck under its own horns and trucks', () => {
    const { game, backend, cues } = inTraffic();
    const sentBefore = backend.traffic.length;
    for (let i = 0; i < 30 * 60; i++) game.tick();
    expect(trafficCues(cues()).length).toBeGreaterThan(5);
    expect(backend.traffic.length).toBe(sentBefore);
  });

  it.each(['pause', 'mute', 'gameOver', 'title'] as const)('goes silent on %s', (what) => {
    const { game, backend, cues } = inTraffic();
    if (what === 'pause') game.commands.pause();
    if (what === 'mute') game.commands.setMuted(true);
    if (what === 'gameOver') game.commands.gameOver();
    if (what === 'title') game.state.mode = 'title';
    game.tick();
    expect(backend.traffic.at(-1)).toBe(0);
    const honks = trafficCues(cues()).length;
    for (let i = 0; i < 20 * 60; i++) game.tick();
    expect(backend.traffic.at(-1)).toBe(0);
    expect(trafficCues(cues()).length).toBe(honks);
  });

  it('starts each run with fresh honk slots', () => {
    const { game, cues } = inTraffic(1);
    const firstRun = trafficCues(cues()).length;
    expect(firstRun).toBeGreaterThan(0);
    game.commands.gameOver();
    game.tick();
    game.commands.startRun();
    game.state.trafficDensity = 1;
    for (let i = 0; i < 60; i++) game.tick();
    expect(trafficCues(cues()).length).toBe(2 * firstRun);
  });

  it('comes back after resuming', () => {
    const { game, backend } = inTraffic();
    game.commands.pause();
    game.tick();
    game.commands.resume();
    for (let i = 0; i < 120; i++) game.tick();
    expect(backend.traffic.at(-1)).toBeGreaterThan(0.9);
  });

  it('logs traffic start and stop for the debug listener', () => {
    const backend = new FakeBackend();
    const heard: string[] = [];
    const game = new Game({
      systems: [createAudioSystem({ backend, store: createStore(null), onSound: (name) => heard.push(name) })],
    });
    game.commands.startRun();
    game.state.trafficDensity = 1;
    for (let i = 0; i < 60; i++) game.tick();
    game.commands.pause();
    game.tick();
    expect(heard.filter((name) => name.startsWith('traffic:'))).toEqual(['traffic:start', 'traffic:stop']);
  });
});

describe('audio system: vehicles passing by', () => {
  type Vehicle = { kind: 'car' | 'van' | 'bus' | 'truck'; front: boolean; light: boolean };
  const pass = (s: ReturnType<typeof setup>, v: Partial<Vehicle> = {}) =>
    s.game.bus.emit('vehiclePassed', { kind: 'car', front: true, light: true, ...v });
  const passes = (s: ReturnType<typeof setup>) => s.backend.played.filter((p) => p.cue.startsWith('pass'));
  /** Advances the run time by `seconds` of ticks. */
  const wait = (s: ReturnType<typeof setup>, seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) s.game.tick();
  };

  it('plays a kind- and lane-dependent pass-by sound', () => {
    const s = playing();
    pass(s, { kind: 'truck', front: true });
    wait(s, 0.5);
    pass(s, { kind: 'car', front: false });
    const [truck, car] = passes(s);
    expect(truck!.cue).toBe('passTruck');
    expect(car!.cue).toBe('passCar');
    expect(car!.intensity).toBeLessThan(truck!.intensity);
  });

  it('thins out dense Mitte traffic and keeps it subtle', () => {
    const s = playing();
    for (let i = 0; i < 50; i++) {
      pass(s, { light: false });
      wait(s, 0.2);
    }
    const heard = passes(s);
    expect(heard.length).toBeGreaterThan(0);
    expect(heard.length).toBeLessThanOrEqual(12);
    for (const p of heard) expect(p.intensity).toBeLessThanOrEqual(0.5);
  });

  it('does not duck the rumble (it is traffic itself)', () => {
    const s = playing();
    s.game.state.trafficDensity = 1;
    wait(s, 5);
    const sent = s.backend.traffic.length;
    pass(s, { light: false });
    wait(s, 0.2);
    expect(s.backend.traffic.length).toBe(sent);
  });

  it('ducks under a gameplay sound like the rumble', () => {
    const s = playing();
    wait(s, 1);
    pass(s);
    const full = passes(s).at(-1)!.intensity;
    wait(s, 1);
    s.game.bus.emit('jump', { velocity: 250 });
    s.game.tick();
    pass(s);
    expect(passes(s).at(-1)!.intensity).toBeLessThanOrEqual(full * TRAFFIC.duckTo + 0.001);
  });

  it.each(['pause', 'gameOver', 'title'] as const)('stays silent on %s', (what) => {
    const s = playing();
    if (what === 'pause') s.game.commands.pause();
    if (what === 'gameOver') s.game.commands.gameOver();
    if (what === 'title') s.game.state.mode = 'title';
    s.game.tick();
    pass(s);
    expect(passes(s)).toEqual([]);
  });

  it('is inaudible while muted (logged as muted, the backend stays muted)', () => {
    const backend = new FakeBackend();
    const heard: { name: string; muted: boolean }[] = [];
    const game = new Game({
      systems: [createAudioSystem({ backend, store: createStore(null), onSound: (name, muted) => heard.push({ name, muted }) })],
    });
    game.commands.startRun();
    game.commands.setMuted(true);
    game.bus.emit('vehiclePassed', { kind: 'bus', front: true, light: true });
    expect(backend.muted).toBe(true);
    expect(heard.filter((h) => h.name === 'passBus')).toEqual([{ name: 'passBus', muted: true }]);
  });

  it('makes the light-traffic hum audible but quieter than Mitte', () => {
    const light = playing();
    light.game.state.trafficDensity = 0.05;
    wait(light, 5);
    const mitte = playing();
    mitte.game.state.trafficDensity = 1;
    wait(mitte, 5);
    expect(light.backend.traffic.at(-1)!).toBeGreaterThanOrEqual(0.15);
    expect(light.backend.traffic.at(-1)!).toBeLessThanOrEqual(mitte.backend.traffic.at(-1)! * 0.35);
  });
});
