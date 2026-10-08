/**
 * AudioBackend on WebAudio. The AudioContext is created lazily in the first
 * user gesture (autoplay policies) and resumed in every later gesture while
 * it is suspended or interrupted (iOS Safari). Cues played while the context
 * is resuming wait (see PendingCues) and play once it runs, if still fresh. Missing or failing WebAudio
 * leaves the backend silent; nothing here throws.
 */
import type { AudioBackend, Cue, LoopName } from './backend';
import { GRIND, MASTER_GAIN, SOUNDS, TRAFFIC_RUMBLE, type Voice } from './sounds';

type ContextFactory = () => AudioContext | null;

/** The traffic rumble's nodes that follow the level (built once, never stopped). */
interface TrafficRumble {
  bus: GainNode;
  /** Road noise lowpass: opens up with the level. */
  road: BiquadFilterNode;
}

interface RunningLoop {
  bus: GainNode;
  sources: AudioScheduledSourceNode[];
}

const SILENT = 0.0001;
/** A cue waiting for the context to resume is dropped this many ms after its start time (it would sound late). */
const PENDING_MAX_AGE_MS = 250;

interface PendingCue {
  cue: Cue;
  intensity: number;
  pitch: number;
  /** performance.now() at which the cue should start (play time + delay). */
  due: number;
  delayed: boolean;
}

/**
 * Cues waiting for the context to resume. Only the latest immediate cue is
 * kept (e.g. the jump of the unlocking tap), but every delayed cue is kept
 * (e.g. the woozy sting waiting behind the gulps), so a later cue never
 * drops one that was scheduled to follow.
 */
/** A tonal voice moved by the pitch factor (noise keeps its cutoff). */
function transpose(voice: Voice, pitch: number): Voice {
  if (pitch === 1 || voice.wave === 'noise') return voice;
  return { ...voice, freq: voice.freq * pitch, to: voice.to && voice.to * pitch };
}

class PendingCues {
  private cues: PendingCue[] = [];

  add(cue: Cue, intensity: number, delay: number, pitch: number, now: number): void {
    const delayed = delay > 0;
    if (!delayed) this.cues = this.cues.filter((p) => p.delayed);
    this.cues.push({ cue, intensity, pitch, due: now + delay * 1000, delayed });
  }

  clear(): void {
    this.cues = [];
  }

  /** Removes all cues and returns the fresh ones with their remaining delay in seconds. */
  take(now: number): { cue: Cue; intensity: number; delay: number; pitch: number }[] {
    const fresh = this.cues.filter((p) => now - p.due <= PENDING_MAX_AGE_MS);
    this.cues = [];
    return fresh.map((p) => ({ cue: p.cue, intensity: p.intensity, pitch: p.pitch, delay: Math.max(0, (p.due - now) / 1000) }));
  }
}

function browserContext(): AudioContext | null {
  const w = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const Ctor = globalThis.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/** One second of deterministic white noise, shared by all noise voices. */
function noiseBuffer(ac: AudioContext): AudioBuffer {
  const buffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2545f491;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = seed / 0x80000000 - 1;
  }
  return buffer;
}

export function createWebAudioBackend(factory: ContextFactory = browserContext): AudioBackend {
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let unavailable = false;
  let muted = false;
  const loops = new Map<LoopName, RunningLoop>();
  const pending = new PendingCues();
  /** Traffic rumble, built on the first audible level and reused (never stopped). */
  let traffic: TrafficRumble | null = null;
  /** Last requested traffic level, applied once the context runs. */
  let trafficLevel = 0;

  const masterLevel = () => (muted ? 0 : MASTER_GAIN);
  const ready = () => (ac && master && ac.state === 'running' ? ac : null);

  function create(): void {
    try {
      ac = factory();
      if (!ac) {
        unavailable = true;
        return;
      }
      master = ac.createGain();
      master.gain.value = masterLevel();
      master.connect(ac.destination);
      noise = noiseBuffer(ac);
      // iOS unlocks output only after a sound starts inside the gesture.
      const blip = ac.createBufferSource();
      blip.buffer = ac.createBuffer(1, 1, ac.sampleRate);
      blip.connect(ac.destination);
      blip.start(0);
    } catch {
      ac = null;
      master = null;
      unavailable = true;
    }
  }

  function noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    return src;
  }

  function oscillator(ctx: AudioContext, wave: OscillatorType, freq: number): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;
    return osc;
  }

  function playVoice(ctx: AudioContext, voice: Voice, intensity: number, delay: number): void {
    const t0 = ctx.currentTime + delay + voice.at;
    const end = t0 + voice.dur;
    /** Sweeps a frequency param from voice.freq to voice.to over the voice. */
    const sweep = (param: AudioParam) => {
      if (!voice.to) return;
      param.setValueAtTime(voice.freq, t0);
      param.exponentialRampToValueAtTime(voice.to, end);
    };
    let src: AudioScheduledSourceNode;
    if (voice.wave === 'noise') {
      src = noiseSource(ctx);
    } else {
      const osc = oscillator(ctx, voice.wave, voice.freq);
      sweep(osc.frequency);
      src = osc;
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, t0);
    env.gain.linearRampToValueAtTime(voice.gain * intensity, t0 + (voice.attack ?? 0.005));
    env.gain.exponentialRampToValueAtTime(SILENT, end);
    if (voice.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = voice.filter;
      filter.frequency.value = voice.freq;
      sweep(filter.frequency);
      src.connect(filter).connect(env);
    } else {
      src.connect(env);
    }
    env.connect(master!);
    src.start(t0);
    src.stop(end + 0.02);
  }

  /** Grind: band-passed noise scrape plus a wobbling low square buzz on a fading bus. */
  function startGrind(ctx: AudioContext): RunningLoop {
    const now = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(SILENT, now);
    bus.gain.linearRampToValueAtTime(1, now + GRIND.fade);
    bus.connect(master!);

    const scrape = noiseSource(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = GRIND.noise.freq;
    band.Q.value = GRIND.noise.q;
    const scrapeGain = ctx.createGain();
    scrapeGain.gain.value = GRIND.noise.gain;
    scrape.connect(band).connect(scrapeGain).connect(bus);

    const buzz = oscillator(ctx, 'square', GRIND.buzz.freq);
    const buzzGain = ctx.createGain();
    buzzGain.gain.value = GRIND.buzz.gain;
    buzz.connect(buzzGain).connect(bus);

    const wobble = oscillator(ctx, 'sine', GRIND.buzz.wobbleHz);
    const depth = ctx.createGain();
    depth.gain.value = GRIND.buzz.wobbleDepth;
    wobble.connect(depth).connect(buzz.frequency);

    const sources = [scrape, buzz, wobble];
    for (const s of sources) s.start(now);
    return { bus, sources };
  }

  /** Traffic: the layered rumble of TRAFFIC_RUMBLE on one bus, silent until a level arrives. */
  function buildTraffic(ctx: AudioContext): TrafficRumble {
    const { noise: road, hiss, drone } = TRAFFIC_RUMBLE;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(master!);

    const filtered = (type: BiquadFilterType, freq: number, q: number, gain: number) => {
      const src = noiseSource(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const level = ctx.createGain();
      level.gain.value = gain;
      src.connect(filter).connect(level).connect(bus);
      return { src, filter };
    };
    const roadNoise = filtered('lowpass', road.freq, road.q, road.gain);
    const tyres = filtered('bandpass', hiss.freq, hiss.q, hiss.gain);

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = drone.cutoff;
    const droneGain = ctx.createGain();
    droneGain.gain.value = drone.gain;
    droneFilter.connect(droneGain).connect(bus);
    const engines = drone.freqs.map((freq) => {
      const osc = oscillator(ctx, 'sawtooth', freq);
      osc.connect(droneFilter);
      return osc;
    });
    const throb = oscillator(ctx, 'sine', drone.throbHz);
    const depth = ctx.createGain();
    depth.gain.value = drone.throbDepth;
    throb.connect(depth).connect(droneGain.gain);

    const now = ctx.currentTime;
    for (const s of [roadNoise.src, tyres.src, ...engines, throb]) s.start(now);
    return { bus, road: roadNoise.filter };
  }

  const guard = (fn: () => void) => {
    try {
      fn();
    } catch {
      // Audio is optional: never break the game.
    }
  };

  function playNow(ctx: AudioContext, cue: Cue, intensity: number, delay: number, pitch: number): void {
    guard(() => {
      for (const voice of SOUNDS[cue]) playVoice(ctx, transpose(voice, pitch), intensity, delay);
    });
  }

  /** Glides the rumble bus to `trafficLevel`; builds it on the first audible level once the context runs. */
  function applyTraffic(): void {
    const ctx = ready();
    if (!ctx || (!traffic && trafficLevel === 0)) return;
    guard(() => {
      traffic ??= buildTraffic(ctx);
      const { glide, noise: road } = TRAFFIC_RUMBLE;
      const now = ctx.currentTime;
      traffic.bus.gain.setTargetAtTime(trafficLevel, now, glide);
      const cutoff = road.freq + (road.freqFull - road.freq) * Math.min(1, trafficLevel);
      traffic.road.frequency.setTargetAtTime(cutoff, now, glide);
    });
  }

  function playPending(): void {
    applyTraffic();
    const cues = pending.take(performance.now());
    const ctx = ready();
    if (!ctx || muted) return;
    for (const p of cues) playNow(ctx, p.cue, p.intensity, p.delay, p.pitch);
  }

  return {
    unlock() {
      if (unavailable) return;
      if (!ac) create();
      if (ac && ac.state !== 'running') {
        guard(
          () =>
            void ac!.resume().then(playPending, () => pending.clear()),
        );
      }
    },
    play(cue: Cue, intensity: number, delay = 0, pitch = 1) {
      if (muted) return;
      const ctx = ready();
      if (ctx) playNow(ctx, cue, intensity, delay, pitch);
      else if (ac && master) pending.add(cue, intensity, delay, pitch, performance.now());
    },
    startLoop(loop: LoopName) {
      const ctx = ready();
      if (!ctx || loops.has(loop)) return;
      guard(() => loops.set(loop, startGrind(ctx)));
    },
    stopLoop(loop: LoopName) {
      const running = loops.get(loop);
      if (!running || !ac) return;
      loops.delete(loop);
      const now = ac.currentTime;
      guard(() => {
        running.bus.gain.setTargetAtTime(0, now, GRIND.fade / 3);
        for (const s of running.sources) s.stop(now + GRIND.fade);
      });
    },
    setMuted(value: boolean) {
      muted = value;
      if (muted) pending.clear();
      if (ac && master) guard(() => master!.gain.setTargetAtTime(masterLevel(), ac!.currentTime, 0.01));
    },
    setTraffic(level: number) {
      trafficLevel = Math.max(0, level);
      applyTraffic();
    },
    status() {
      if (unavailable) return 'unavailable';
      return ac ? ac.state : 'locked';
    },
  };
}
