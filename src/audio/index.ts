/**
 * Audio system: maps bus events to chiptune cues on an AudioBackend, keeps
 * the grind loop, the traffic rumble and the NorDIY park sounds in sync with
 * the game, unlocks audio on user gestures and persists the mute flag. Sound
 * design lives in sounds.ts, traffic logic in traffic.ts, park logic in
 * park.ts, WebAudio in webaudio.ts.
 */
import { store as defaultStore, type Store } from '../core/storage';
import type { GameContext, GameEvents, System } from '../types';
import type { AudioBackend, Cue } from './backend';
import { ClearedSounds } from './cleared';
import { exposeAudioDebug } from './debug';
import { cheerCue, cheerIntensity, isParkCue, ParkSound } from './park';
import { PASS_BY, PassBy } from './passby';
import { GLUG_LENGTH, stuntStepPitch } from './sounds';
import { isTrafficCue, TrafficNoise } from './traffic';
import { createWebAudioBackend } from './webaudio';

export interface AudioSystemOptions {
  backend?: AudioBackend;
  store?: Store;
  /**
   * Called with every cue name, `grind:start` / `grind:stop`, `traffic:start` /
   * `traffic:stop` and `park:start` / `park:stop` (debug log,
   * playtests), also while muted; `muted` tells whether it was inaudible.
   */
  onSound?: (name: string, muted: boolean) => void;
}

const MUTED_KEY = 'muted';
/** Ticks the action must stay held after a jump (while rising) to add the boost sound. */
const BOOST_TICKS = 6;
/** Landing impact (vy in view px/s) that plays the thud at full volume. */
const HARD_LANDING = 350;
/**
 * Landing impact (view px/s) from which a big drop adds the heavy boom: above
 * a full-hold jump (~370), so only drops from a ledge or a kicker launch get it.
 */
const BIG_DROP = 380;
/** Landing impact at which the boom is at full volume and the thud lowest. */
const HUGE_DROP = 520;
/** How far a huge drop lowers the landing thud (pitch factor 1 - this). */
const BIG_DROP_PITCH_DROP = 0.2;
type CrashKind = GameEvents['crash']['kind'];
/** Crash kinds that are people: they get a soft 'oof' on top of the crash. */
const PEOPLE: ReadonlySet<CrashKind> = new Set<CrashKind>(['vfbFan', 'wasenGuest']);
/** Trick points that play the plain trick sting at full volume. */
const TRICK_FULL_POINTS = 100;
/** Grind trick points from which a sparkle follows the sting. */
const TRICK_BIG_POINTS = 100;
/** Air trick points from which a kickflip counts as a launch kickflip and gets the bigger sting. */
const KICKFLIP_BIG_POINTS = 150;
/** Seconds after the session roar starts until the finger whistle cuts through it. */
const SESSION_WHISTLE_DELAY = 0.35;

export function createAudioSystem(options: AudioSystemOptions = {}): System {
  const backend = options.backend ?? createWebAudioBackend();
  const store = options.store ?? defaultStore;
  const park = new ParkSound();
  const onSound = options.onSound ?? exposeAudioDebug(backend, park);
  let grinding = false;
  let muted = false;
  /** Ticks the jump has been held so far, or null when no boost is pending. */
  let boostTicks: number | null = null;
  /** Run time of the last drink sound, so the woozy sting can wait for the gulps. */
  let glugAt = -Infinity;
  /** Whether the air trick spin of the current trick has played. */
  let spinning = false;
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
  const play = (cue: Cue, intensity = 1, delay = 0, pitch = 1) => {
    onSound?.(cue, muted);
    // Gameplay sounds stay clearly audible over the Mitte rumble and the park.
    if (!isTrafficCue(cue) && !isParkCue(cue)) traffic.duck();
    safely(() => backend.play(cue, intensity, delay, pitch));
  };
  /** The plain trick sting, louder for more points (grind tricks, reduced kickflips). */
  const playTrick = (points: number) => play('trick', 0.5 + 0.5 * Math.min(1, Math.max(0, points) / TRICK_FULL_POINTS));
  /** One tick of the traffic rumble, horns and trucks: silent unless playing and unmuted. */
  const updateTraffic = (ctx: GameContext) => {
    const { state } = ctx;
    const wasSounding = traffic.sounding;
    const step = traffic.update(state.trafficDensity, state.mode === 'playing' && !muted, state.time);
    if (step.level !== null) safely(() => backend.setTraffic(step.level!));
    if (wasSounding !== traffic.sounding) onSound?.(wasSounding ? 'traffic:stop' : 'traffic:start', muted);
    if (step.cue) play(step.cue);
  };
  /** One tick of the NorDIY park ambience and boombox: silent unless playing and unmuted. */
  const updatePark = (ctx: GameContext) => {
    const { state } = ctx;
    const wasSounding = park.sounding;
    const active = state.mode === 'playing' && !muted;
    const step = park.update(state.park, state.distance, active, state.time, traffic.duckFactor);
    if (step.ambience !== null || step.boombox !== null) safely(() => backend.setPark(park.ambience, park.boombox));
    if (wasSounding !== park.sounding) onSound?.(wasSounding ? 'park:stop' : 'park:start', muted);
    if (step.cue) play(step.cue, park.level);
  };
  /** The air trick spin, once as each trick starts (before the traffic tick, so it ducks the rumble at once). */
  const updateSpin = (ctx: GameContext) => {
    const airTrick = ctx.state.mode === 'playing' && ctx.state.player.airTrick;
    if (airTrick && !spinning) play('airSpin');
    spinning = airTrick;
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
      bus.on('land', ({ impact }) => {
        const intensity = 0.3 + 0.7 * Math.min(1, Math.max(0, impact) / HARD_LANDING);
        if (impact < BIG_DROP) {
          play('land', intensity);
          return;
        }
        // A big drop: the thud sinks lower and a deep boom grows under it.
        const heavy = Math.min(1, (impact - BIG_DROP) / (HUGE_DROP - BIG_DROP));
        play('land', intensity, 0, 1 - BIG_DROP_PITCH_DROP * heavy);
        play('landHeavy', 0.4 + 0.6 * heavy);
      });
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
        // A kickflip bail (ROADMAP 41): the loose board clatters away.
        if (kind === 'bail') play('clatter');
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
        playTrick(points);
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
      // Stunt lines: a springy take-off, a melody that climbs with each piece made,
      // and a fanfare for a full line (a dropped line only fades with a soft blip).
      // Ledge grinds bring their own grindStart / grindEnd, so the grind loop covers them.
      bus.on('launch', () => play('launch'));
      bus.on('stuntStep', ({ step }) => play('stuntStep', 1, 0, stuntStepPitch(step)));
      bus.on('stuntEnd', ({ completed }) => play(completed ? 'stuntFanfare' : 'stuntFizzle'));
      // Kickflip (air trick): a quick spin as it starts (update); once landed a flip whoosh,
      // a catch click and a bright sting, bigger for a launch kickflip. A reduced kickflip
      // (repeated or into empty air, ROADMAP 41) only gets the plain trick sting.
      bus.on('airTrick', ({ points, full }) => {
        if (!full) playTrick(points);
        else play(points >= KICKFLIP_BIG_POINTS ? 'airTrickBig' : 'airTrick');
      });
      // NorDIY park: the crowd cheers each trick (bigger with the session), roars and
      // whistles for a "Session!" bonus, and a crisp clap for a high five. Same in kid mode.
      bus.on('sessionCheer', ({ level }) => play(cheerCue(level), cheerIntensity(level)));
      bus.on('sessionEnd', ({ points }) => {
        if (points <= 0) return;
        play('sessionRoar');
        play('fingerWhistle', 1, SESSION_WHISTLE_DELAY);
      });
      bus.on('highFive', () => play('highFive'));
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
        park.reset();
      });
    },
    update(ctx: GameContext) {
      // Runs after gameplay, so every clear of this tick is known by now.
      for (let n = clears.flush(); n > 0; n--) play('cleared');
      updateSpin(ctx);
      updateTraffic(ctx);
      updatePark(ctx);
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
