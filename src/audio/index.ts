/**
 * Audio system: maps bus events to chiptune cues on an AudioBackend, keeps
 * the grind loop in sync with the game, unlocks audio on user gestures and
 * persists the mute flag. Sound design lives in sounds.ts, WebAudio in webaudio.ts.
 */
import { store as defaultStore, type Store } from '../core/storage';
import type { EntityKind, GameContext, System } from '../types';
import type { AudioBackend, Cue } from './backend';
import { exposeAudioDebug } from './debug';
import { createWebAudioBackend } from './webaudio';

export interface AudioSystemOptions {
  backend?: AudioBackend;
  store?: Store;
  /**
   * Called with every cue name and `grind:start` / `grind:stop` (debug log,
   * playtests), also while muted; `muted` tells whether it was inaudible.
   */
  onSound?: (name: string, muted: boolean) => void;
}

const MUTED_KEY = 'muted';
/** Ticks the action must stay held after a jump (while rising) to add the boost sound. */
const BOOST_TICKS = 6;
/** Landing impact (vy in view px/s) that plays the thud at full volume. */
const HARD_LANDING = 350;
/** Crash kinds that are people: they get a soft 'oof' on top of the crash. */
const PEOPLE: ReadonlySet<EntityKind> = new Set<EntityKind>(['vfbFan', 'wasenGuest']);

export function createAudioSystem(options: AudioSystemOptions = {}): System {
  const backend = options.backend ?? createWebAudioBackend();
  const store = options.store ?? defaultStore;
  const onSound = options.onSound ?? exposeAudioDebug(backend);
  let grinding = false;
  let muted = false;
  /** Ticks the jump has been held so far, or null when no boost is pending. */
  let boostTicks: number | null = null;

  /** Audio is decoration: a failing backend must never break the game loop. */
  const safely = (fn: () => void) => {
    try {
      fn();
    } catch {
      // Ignore: the game keeps running silently.
    }
  };
  const play = (cue: Cue, intensity = 1) => {
    onSound?.(cue, muted);
    safely(() => backend.play(cue, intensity));
  };
  const startGrind = () => {
    if (grinding) return;
    grinding = true;
    onSound?.('grind:start', muted);
    safely(() => backend.startLoop('grind'));
  };
  const stopGrind = () => {
    if (!grinding) return;
    grinding = false;
    onSound?.('grind:stop', muted);
    safely(() => backend.stopLoop('grind'));
  };

  return {
    name: 'audio',
    init(ctx: GameContext) {
      const { bus } = ctx;
      ctx.onUserGesture(() => safely(() => backend.unlock()));

      bus.on('mute', (event) => {
        muted = event.muted;
        safely(() => backend.setMuted(muted));
        store.set(MUTED_KEY, muted);
      });
      const storedMute = store.get<boolean>(MUTED_KEY, false) === true;
      if (storedMute) ctx.commands.setMuted(true);
      else safely(() => backend.setMuted(false));

      bus.on('jump', () => {
        play('jump');
        boostTicks = 0;
      });
      bus.on('land', ({ impact }) => play('land', 0.3 + 0.7 * Math.min(1, Math.max(0, impact) / HARD_LANDING)));
      bus.on('starCollected', () => play('star'));
      bus.on('chillStart', () => play('chill'));
      bus.on('obstacleCleared', () => play('cleared'));
      bus.on('crash', ({ kind }) => {
        stopGrind();
        play('crash');
        if (PEOPLE.has(kind)) play('oof');
      });
      bus.on('gameOver', () => {
        stopGrind();
        play('gameOver');
      });
      bus.on('grindStart', startGrind);
      bus.on('grindEnd', stopGrind);
      bus.on('pause', stopGrind);
      bus.on('resume', () => {
        if (ctx.state.player.grinding) startGrind();
      });
      bus.on('runStarted', () => {
        stopGrind();
        boostTicks = null;
      });
    },
    update(ctx: GameContext) {
      if (ctx.state.mode !== 'playing') {
        stopGrind();
        boostTicks = null;
        return;
      }
      if (boostTicks === null) return;
      const p = ctx.state.player;
      if (!ctx.input.action.held || p.grounded || p.vy >= 0) {
        boostTicks = null;
      } else if (++boostTicks >= BOOST_TICKS) {
        boostTicks = null;
        play('boost');
      }
    },
  };
}
