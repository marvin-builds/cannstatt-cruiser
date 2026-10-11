import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { Rng } from '../core/rng';
import { createStore } from '../core/storage';
import { pigeonsPiece, scooterPiece } from '../gameplay/hazards';
import type { Entity } from '../types';
import type { AudioBackend, Cue } from './backend';
import { HAZARD_CUES, HazardSounds, SCOOTER_WARN } from './hazards';
import { createAudioSystem } from './index';
import { SOUNDS } from './sounds';

const VIEW = 400;

const scooterAt = (id: number, x: number): Entity => ({ id, ...scooterPiece(new Rng(1), x, false), done: false });
const flockAt = (id: number, x: number): Entity => ({ id, ...pigeonsPiece(x), done: false });

describe('hazard sounds: which cue when', () => {
  it('the e-scooter whirrs (and rings) once, just before it comes on screen', () => {
    const sounds = new HazardSounds();
    const rider = scooterAt(1, VIEW + SCOOTER_WARN + 20);
    expect(sounds.update([rider], VIEW)).toEqual([]);
    rider.x = VIEW + SCOOTER_WARN - 1;
    expect(sounds.update([rider], VIEW)).toEqual(['scooter']);
    rider.x -= 30;
    expect(sounds.update([rider], VIEW)).toEqual([]);
  });

  it('a scooter knocked over or passed before it was heard stays quiet', () => {
    const sounds = new HazardSounds();
    const rider = scooterAt(2, 100);
    rider.done = true;
    expect(sounds.update([rider], VIEW)).toEqual([]);
  });

  it('pigeons flap once as they take off', () => {
    const sounds = new HazardSounds();
    const flock = flockAt(3, 200);
    expect(sounds.update([flock], VIEW)).toEqual([]);
    flock.data = { ...flock.data, flushedAt: 1.5 };
    expect(sounds.update([flock], VIEW)).toEqual(['pigeons']);
    expect(sounds.update([flock], VIEW)).toEqual([]);
  });

  it('starts over with a new run', () => {
    const sounds = new HazardSounds();
    const rider = scooterAt(4, VIEW);
    expect(sounds.update([rider], VIEW)).toEqual(['scooter']);
    sounds.reset();
    expect(sounds.update([rider], VIEW)).toEqual(['scooter']);
  });

  it('every hazard cue has a sound', () => {
    expect([...HAZARD_CUES].sort()).toEqual(['pigeons', 'scooter']);
    for (const cue of HAZARD_CUES) expect(SOUNDS[cue].length).toBeGreaterThan(0);
  });
});

class FakeBackend implements AudioBackend {
  played: Cue[] = [];
  unlock(): void {}
  wake(): void {}
  play(cue: Cue): void {
    this.played.push(cue);
  }
  setTraffic(): void {}
  setPark(): void {}
  startLoop(): void {}
  stopLoop(): void {}
  setMuted(): void {}
}

describe('hazard sounds in the audio system', () => {
  it('plays them while a run is on, from the entities on the street', () => {
    const backend = new FakeBackend();
    const storage = new Map<string, string>();
    const store = createStore({ getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } as unknown as Storage);
    const game = new Game({ systems: [createAudioSystem({ backend, store, watchVisible: () => {} })] });
    game.state.entities.push(scooterAt(5, 200));
    game.tick();
    expect(backend.played).not.toContain('scooter');
    game.commands.startRun();
    game.state.entities.push(scooterAt(6, 200), { ...flockAt(7, 150), data: { ...flockAt(7, 150).data, flushedAt: 0 } });
    game.tick();
    expect(backend.played.filter((c) => c === 'scooter')).toHaveLength(1);
    expect(backend.played.filter((c) => c === 'pigeons')).toHaveLength(1);
  });
});
