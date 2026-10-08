/**
 * Audio system: maps bus events to chiptune cues on an AudioBackend, keeps
 * the grind loop and the traffic rumble in sync with the game, unlocks
 * audio on user gestures and persists the mute flag. Sound design lives in
 * sounds.ts, traffic logic in traffic.ts, WebAudio in webaudio.ts.
 */
import { store as defaultStore, type Store } from '../core/storage';
import type { EntityKind, GameContext, System } from '../types';
import type { AudioBackend, Cue } from './backend';
import { ClearedSounds } from './cleared';
import { exposeAudioDebug } from './debug';
import { PASS_BY, PassBy } from './passby';
import { GLUG_LENGTH } from './sounds';
import { isTrafficCue, TrafficNoise } from './traffic';
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
/** Grind trick points that play the trick sting at full volume. */
const TRICK_FULL_POINTS = 100;
/** Grind trick points from which a sparkle follows the sting. */
const TRICK_BIG_POINTS = 100;

export function createAudioSystem(options: AudioSystemOptions = {}): System {
  const backend = options.backend ?? createWebAudioBackend();
  const store = options.store ?? defaultStore;
  const onSound = options.onSound ?? exposeAudioDebug(backend);
  let grinding = false;
  let muted = false;
  /** Ticks the jump has been held so far, or null when no boost is pending. */
  let boostTicks: number | null = null;
  /** Run time of the last drink sound, so the woozy sting can wait for the gulps. */
  let glugAt = -Infinity;
  const traffic = new TrafficNoise();
  const passBy = new PassBy();
  const clears = new ClearedSounds();

  /** Audio is decoration: a failing backend must never break the game loop. */
  const safely = (fn: () => void) => {
    try {
      fn();
    } catch {
      // Ignore: the game keeps running silently.
    }
  };
  const play = (cue: Cue, intensity = 1, delay = 0) => {
    onSound?.(cue, muted);
    // Gameplay sounds stay clearly audible over the Mitte rumble.
    if (!isTrafficCue(cue)) traffic.duck();
    safely(() => backend.play(cue, intensity, delay));
  };
  /** One tick of the traffic rumble, horns and trucks: silent unless playing and unmuted. */
  const updateTraffic = (ctx: GameContext) => {
    const { state } = ctx;
    const wasSounding = traffic.sounding;
    const step = traffic.update(state.trafficDensity, state.mode === 'playing' && !muted, state.time);
    if (step.level !== null) safely(() => backend.setTraffic(step.level!));
    if (wasSounding !== traffic.sounding) onSound?.(wasSounding ? 'traffic:stop' : 'traffic:start', muted);
    if (step.cue) play(step.cue);
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
      // Kid mode: bubble gum instead of the joint, so a sweet bubbly cue instead of the mellow one.
      bus.on('chillStart', () => play(ctx.state.kidMode ? 'bubble' : 'chill'));
      // Held until the end of the tick: a ball hit or stomp of the same person brings its own sound.
      bus.on('obstacleCleared', ({ entityId }) => clears.cleared(entityId, ctx.state.frame));
      bus.on('crash', ({ kind }) => {
        stopGrind();
        play('crash');
        if (PEOPLE.has(kind)) play('oof');
        if (kind === 'ball') play('thud');
        // The skater's bubble gum bubble pops (see player/bubble.ts).
        if (ctx.state.kidMode && ctx.state.chillTimer > 0) play('pop');
      });
      // Landing on a person: the springy bounce, and the person's 'hoppla' as they stumble.
      bus.on('stomp', ({ entityId }) => {
        clears.voicedBy(entityId, ctx.state.frame);
        play('boing');
        play('hoppla');
      });
      bus.on('itemCaught', () => play('catch'));
      // Using the carried item (ballThrown adds nothing: the throw already whooshed).
      bus.on('itemUsed', ({ action }) => {
        if (action === 'drink') {
          glugAt = ctx.state.time;
          play('glug');
        } else {
          play(action === 'eat' ? 'munch' : 'whoosh');
        }
      });
      bus.on('drunkStart', () => play('woozy', 1, Math.max(0, GLUG_LENGTH - (ctx.state.time - glugAt))));
      bus.on('healthGained', () => play('heart'));
      bus.on('ballHit', ({ entityId }) => {
        clears.voicedBy(entityId, ctx.state.frame);
        play('bonk');
        play('cheer');
      });
      bus.on('ballBack', () => play('whistle'));
      bus.on('grindTrick', ({ points }) => {
        play('trick', 0.5 + 0.5 * Math.min(1, Math.max(0, points) / TRICK_FULL_POINTS));
        if (points >= TRICK_BIG_POINTS) play('trickBig');
      });
      bus.on('gameOver', () => {
        stopGrind();
        play('gameOver');
      });
      // A vehicle drives past: a pass-by whoosh, ducked like the rumble under gameplay sounds.
      // Light traffic has no steady hum, so its hum swells in and out around each vehicle.
      bus.on('vehiclePassed', (vehicle) => {
        if (ctx.state.mode !== 'playing') return;
        if (vehicle.light) traffic.swell(vehicle.front ? PASS_BY.lane.front : PASS_BY.lane.back, ctx.state.time);
        const step = passBy.pass(vehicle, ctx.state.time);
        if (step) play(step.cue, step.intensity * traffic.duckFactor);
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
        glugAt = -Infinity;
        traffic.reset();
        passBy.reset();
        clears.reset();
      });
    },
    update(ctx: GameContext) {
      // Runs after gameplay, so every clear of this tick is known by now.
      for (let n = clears.flush(); n > 0; n--) play('cleared');
      updateTraffic(ctx);
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
