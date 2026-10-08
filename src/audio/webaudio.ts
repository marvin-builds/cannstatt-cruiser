/**
 * AudioBackend on WebAudio. The AudioContext is created lazily in the first
 * user gesture (autoplay policies) and resumed in every later gesture while
 * it is suspended or interrupted (iOS Safari). The latest cue played while
 * the context is resuming (e.g. the jump of the unlocking tap) is kept and
 * played once it runs, if it is still fresh. Missing or failing WebAudio
 * leaves the backend silent; nothing here throws.
 */
import type { AudioBackend, Cue, LoopName } from './backend';
import { GRIND, MASTER_GAIN, SOUNDS, TRAFFIC_RUMBLE, type Voice } from './sounds';

type ContextFactory = () => AudioContext | null;

interface RunningLoop {
  bus: GainNode;
  sources: AudioScheduledSourceNode[];
}

const SILENT = 0.0001;
/** A cue waiting for the context to resume is dropped after this many ms (it would sound late). */
const PENDING_MAX_AGE_MS = 250;

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
  let pending: { cue: Cue; intensity: number; at: number } | null = null;
  /** Traffic rumble bus, built on the first audible level and reused (never stopped). */
  let traffic: GainNode | null = null;
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
    let src: AudioScheduledSourceNode;
    if (voice.wave === 'noise') {
      src = noiseSource(ctx);
    } else {
      const osc = oscillator(ctx, voice.wave, voice.freq);
      if (voice.to) {
        osc.frequency.setValueAtTime(voice.freq, t0);
        osc.frequency.exponentialRampToValueAtTime(voice.to, end);
      }
      src = osc;
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, t0);
    env.gain.linearRampToValueAtTime(voice.gain * intensity, t0 + 0.005);
    env.gain.exponentialRampToValueAtTime(SILENT, end);
    if (voice.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = voice.filter;
      filter.frequency.value = voice.freq;
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

  /** Traffic: lowpassed noise rumble plus a low engine hum on one bus, silent until a level arrives. */
  function buildTraffic(ctx: AudioContext): GainNode {
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(master!);

    const rumble = noiseSource(ctx);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = TRAFFIC_RUMBLE.noise.freq;
    low.Q.value = TRAFFIC_RUMBLE.noise.q;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = TRAFFIC_RUMBLE.noise.gain;
    rumble.connect(low).connect(rumbleGain).connect(bus);

    const hum = oscillator(ctx, 'triangle', TRAFFIC_RUMBLE.hum.freq);
    const humGain = ctx.createGain();
    humGain.gain.value = TRAFFIC_RUMBLE.hum.gain;
    hum.connect(humGain).connect(bus);

    const now = ctx.currentTime;
    rumble.start(now);
    hum.start(now);
    return bus;
  }

  const guard = (fn: () => void) => {
    try {
      fn();
    } catch {
      // Audio is optional: never break the game.
    }
  };

  function playNow(ctx: AudioContext, cue: Cue, intensity: number, delay = 0): void {
    guard(() => {
      for (const voice of SOUNDS[cue]) playVoice(ctx, voice, intensity, delay);
    });
  }

  /** Glides the rumble bus to `trafficLevel`; builds it on the first audible level once the context runs. */
  function applyTraffic(): void {
    const ctx = ready();
    if (!ctx || (!traffic && trafficLevel === 0)) return;
    guard(() => {
      traffic ??= buildTraffic(ctx);
      traffic.gain.setTargetAtTime(trafficLevel, ctx.currentTime, TRAFFIC_RUMBLE.glide);
    });
  }

  function playPending(): void {
    applyTraffic();
    const cue = pending;
    pending = null;
    const ctx = ready();
    if (cue && ctx && !muted && performance.now() - cue.at <= PENDING_MAX_AGE_MS) playNow(ctx, cue.cue, cue.intensity);
  }

  return {
    unlock() {
      if (unavailable) return;
      if (!ac) create();
      if (ac && ac.state !== 'running') {
        guard(
          () =>
            void ac!.resume().then(playPending, () => {
              pending = null;
            }),
        );
      }
    },
    play(cue: Cue, intensity: number, delay = 0) {
      if (muted) return;
      const ctx = ready();
      if (ctx) playNow(ctx, cue, intensity, delay);
      else if (ac && master) pending = { cue, intensity, at: performance.now() };
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
      if (muted) pending = null;
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
