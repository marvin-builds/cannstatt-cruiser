import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { createStore } from '../core/storage';
import type { AudioBackend, Cue, LoopName } from './backend';
import { createAudioSystem } from './index';

class FakeBackend implements AudioBackend {
  calls: string[] = [];
  played: { cue: Cue; intensity: number }[] = [];
  loops = new Set<LoopName>();
  muted = false;
  unlock(): void {
    this.calls.push('unlock');
  }
  play(cue: Cue, intensity: number): void {
    this.played.push({ cue, intensity });
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
    ['obstacleCleared', { entityId: 1, kind: 'bin', points: 10 }, 'cleared'],
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
    };
    const game = new Game({
      systems: [createAudioSystem({ backend: broken, store: createStore(null) })],
    });
    expect(() => {
      game.notifyUserGesture();
      game.commands.startRun();
      game.bus.emit('jump', { velocity: 250 });
      game.bus.emit('grindStart', { entityId: 1 });
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
