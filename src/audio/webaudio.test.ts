import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cue } from './backend';
import { SOUNDS } from './sounds';
import { createWebAudioBackend } from './webaudio';

/** Minimal stand-in for an AudioContext: records started/stopped sources, no sound. */
class FakeContext {
  state: string;
  currentTime = 1;
  sampleRate = 8000;
  destination = {};
  started: string[] = [];
  /** Start time (s) of every started source, in start order. */
  startTimes: number[] = [];
  stopped: string[] = [];
  resumes = 0;
  master: { gain: { value: number } } | null = null;
  /** Every oscillator created, to read back the pitch it was given. */
  oscillators: { frequency: { value: number } }[] = [];

  constructor(state = 'running') {
    this.state = state;
  }
  resume() {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  private param() {
    return {
      value: 0,
      setValueAtTime(v: number) {
        this.value = v;
      },
      linearRampToValueAtTime(v: number) {
        this.value = v;
      },
      exponentialRampToValueAtTime(v: number) {
        this.value = v;
      },
      setTargetAtTime(v: number) {
        this.value = v;
      },
      cancelScheduledValues() {},
    };
  }
  private node(kind: string) {
    const ctx = this;
    return {
      kind,
      type: '',
      buffer: null as unknown,
      loop: false,
      gain: this.param(),
      frequency: this.param(),
      Q: this.param(),
      connect(target: unknown) {
        return target;
      },
      disconnect() {},
      start(when = 0) {
        ctx.started.push(kind);
        ctx.startTimes.push(when);
      },
      stop() {
        ctx.stopped.push(kind);
      },
      addEventListener() {},
    };
  }
  createGain() {
    const n = this.node('gain');
    this.master ??= n;
    return n;
  }
  createOscillator() {
    const osc = this.node('osc');
    this.oscillators.push(osc);
    return osc;
  }
  createBufferSource() {
    return this.node('buffer');
  }
  createBiquadFilter() {
    return this.node('filter');
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
}

function setup(state = 'running') {
  const ctx = new FakeContext(state);
  let created = 0;
  const backend = createWebAudioBackend(() => {
    created++;
    return ctx as unknown as AudioContext;
  });
  return { ctx, backend, created: () => created };
}

describe('WebAudio backend', () => {
  it('creates the context only on unlock (inside a user gesture)', () => {
    const { backend, created, ctx } = setup();
    backend.play('jump', 1);
    expect(created()).toBe(0);
    backend.unlock();
    backend.unlock();
    expect(created()).toBe(1);
    const before = ctx.started.length;
    backend.play('jump', 1);
    expect(ctx.started.length).toBeGreaterThan(before);
  });

  it('resumes a suspended context (iOS Safari) on every gesture until it runs', () => {
    const { backend, ctx } = setup('suspended');
    backend.unlock();
    expect(ctx.resumes).toBe(1);
    ctx.state = 'interrupted';
    backend.unlock();
    expect(ctx.resumes).toBe(2);
    backend.unlock();
    expect(ctx.resumes).toBe(2);
  });

  it('does not schedule sounds while the context is still suspended', () => {
    const ctx = new FakeContext('suspended');
    ctx.resume = () => new Promise(() => {});
    const backend = createWebAudioBackend(() => ctx as unknown as AudioContext);
    backend.unlock();
    const before = ctx.started.length;
    backend.play('star', 1);
    expect(ctx.started.length).toBe(before);
  });

  it('plays the cue of the unlocking gesture once the context has resumed', async () => {
    const ctx = new FakeContext('suspended');
    let finishResume = () => {};
    ctx.resume = () =>
      new Promise<void>((done) => {
        finishResume = () => {
          ctx.state = 'running';
          done();
        };
      });
    const backend = createWebAudioBackend(() => ctx as unknown as AudioContext);
    backend.unlock();
    const before = ctx.started.length;
    backend.play('star', 1);
    backend.play('jump', 1);
    finishResume();
    await Promise.resolve();
    await Promise.resolve();
    const played = ctx.started.length - before;
    expect(played).toBeGreaterThan(0);
    backend.play('jump', 1);
    expect(ctx.started.length - before - played).toBe(played);
  });

  it('drops the pending cue when muted before the context resumes', async () => {
    const ctx = new FakeContext('suspended');
    let finishResume = () => {};
    ctx.resume = () =>
      new Promise<void>((done) => {
        finishResume = () => {
          ctx.state = 'running';
          done();
        };
      });
    const backend = createWebAudioBackend(() => ctx as unknown as AudioContext);
    backend.unlock();
    const before = ctx.started.length;
    backend.play('jump', 1);
    backend.setMuted(true);
    finishResume();
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.started.length).toBe(before);
  });

  it('mutes via the master gain and skips one-shots while muted', () => {
    const { backend, ctx } = setup();
    backend.setMuted(true);
    backend.unlock();
    expect(ctx.master!.gain.value).toBe(0);
    const before = ctx.started.length;
    backend.play('crash', 1);
    expect(ctx.started.length).toBe(before);
    backend.setMuted(false);
    expect(ctx.master!.gain.value).toBeGreaterThan(0);
    expect(ctx.master!.gain.value).toBeLessThanOrEqual(0.5);
  });

  it('starts the grind loop once and stops all of its sources', () => {
    const { backend, ctx } = setup();
    backend.unlock();
    const before = ctx.started.length;
    backend.startLoop('grind');
    backend.startLoop('grind');
    const loopSources = ctx.started.length - before;
    expect(loopSources).toBeGreaterThan(0);
    backend.stopLoop('grind');
    expect(ctx.stopped.length).toBe(loopSources);
    backend.stopLoop('grind');
    expect(ctx.stopped.length).toBe(loopSources);
  });

  it('plays every cue without throwing', () => {
    const { backend } = setup();
    backend.unlock();
    for (const cue of Object.keys(SOUNDS) as Cue[]) {
      expect(() => backend.play(cue, 0.5)).not.toThrow();
    }
  });

  it('stays silent and never throws without WebAudio', () => {
    for (const factory of [
      () => null,
      () => {
        throw new Error('NotAllowedError');
      },
    ]) {
      const backend = createWebAudioBackend(factory);
      expect(() => {
        backend.unlock();
        backend.setMuted(true);
        backend.play('jump', 1);
        backend.startLoop('grind');
        backend.stopLoop('grind');
        backend.setTraffic(1);
        backend.setPark(1, 1);
      }).not.toThrow();
      expect(backend.status?.()).toBe('unavailable');
    }
  });

  it('builds the traffic rumble once and reuses its nodes for every level change', () => {
    const { backend, ctx } = setup();
    backend.unlock();
    const before = ctx.started.length;
    backend.setTraffic(0.2);
    const sources = ctx.started.length - before;
    expect(sources).toBeGreaterThan(0);
    for (let i = 0; i <= 100; i++) backend.setTraffic(i / 100);
    backend.setTraffic(0);
    backend.setTraffic(0.7);
    expect(ctx.started.length - before).toBe(sources);
    expect(ctx.stopped).toEqual([]);
  });

  it('builds no traffic nodes for silence or before unlock', () => {
    const { backend, ctx } = setup();
    backend.setTraffic(0.5);
    backend.unlock();
    const before = ctx.started.length;
    backend.setTraffic(0);
    expect(ctx.started.length).toBe(before);
  });

  it('schedules a delayed cue later without throwing', () => {
    const { backend, ctx } = setup();
    backend.unlock();
    const before = ctx.started.length;
    expect(() => backend.play('woozy', 1, 1.2)).not.toThrow();
    expect(ctx.started.length).toBeGreaterThan(before);
  });

  it('reports the context state', () => {
    const { backend } = setup();
    expect(backend.status?.()).toBe('locked');
    backend.unlock();
    expect(backend.status?.()).toBe('running');
  });
});

describe('WebAudio backend: delayed cues while the context resumes', () => {
  afterEach(() => vi.restoreAllMocks());

  /** A suspended context whose resume finishes when `finish` is called (at the faked clock `nowMs`). */
  function resuming() {
    const ctx = new FakeContext('suspended');
    let finish = () => {};
    ctx.resume = () =>
      new Promise<void>((done) => {
        finish = () => {
          ctx.state = 'running';
          done();
        };
      });
    let nowMs = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    const backend = createWebAudioBackend(() => ctx as unknown as AudioContext);
    backend.unlock();
    const resumeAt = async (ms: number) => {
      nowMs = ms;
      finish();
      await Promise.resolve();
      await Promise.resolve();
    };
    return { ctx, backend, resumeAt };
  }

  /** Earliest start time of the sources started from index `from` on. */
  const firstStart = (ctx: FakeContext, from: number) => Math.min(...ctx.startTimes.slice(from));

  it('keeps a delayed cue when a later cue is played before the context runs', async () => {
    const { ctx, backend, resumeAt } = resuming();
    const before = ctx.started.length;
    backend.play('woozy', 1, 1.2);
    backend.play('jump', 1);
    await resumeAt(1050);
    const played = ctx.started.length - before;
    expect(played).toBe(SOUNDS.woozy.length + SOUNDS.jump.length);
  });

  it('plays both the gulps and the woozy sting that waits behind them', async () => {
    const { ctx, backend, resumeAt } = resuming();
    const before = ctx.started.length;
    backend.play('glug', 1);
    backend.play('woozy', 1, 1.28);
    await resumeAt(1050);
    expect(ctx.started.length - before).toBe(SOUNDS.glug.length + SOUNDS.woozy.length);
  });

  it('still plays a delayed cue after a slow resume and keeps its remaining delay', async () => {
    const { ctx, backend, resumeAt } = resuming();
    const before = ctx.started.length;
    backend.play('woozy', 1, 1.2);
    await resumeAt(1500);
    expect(ctx.started.length - before).toBe(SOUNDS.woozy.length);
    expect(firstStart(ctx, before)).toBeCloseTo(ctx.currentTime + 0.7, 5);
  });

  it('drops a delayed cue whose start is long past when the context finally runs', async () => {
    const { ctx, backend, resumeAt } = resuming();
    const before = ctx.started.length;
    backend.play('woozy', 1, 0.5);
    await resumeAt(3000);
    expect(ctx.started.length - before).toBe(0);
  });
});

describe('WebAudio backend: pitch', () => {
  /** Oscillator start frequencies of one cue played at `pitch`. */
  function freqs(pitch?: number) {
    const { ctx, backend } = setup();
    backend.unlock();
    backend.play('stuntStep', 1, 0, pitch);
    return ctx.oscillators.map((o) => o.frequency.value);
  }

  it('transposes every tonal voice of a cue by the pitch factor', () => {
    const base = freqs();
    expect(base.length).toBeGreaterThan(0);
    expect(freqs(1.5)).toEqual(base.map((f) => f * 1.5));
  });

  it('keeps the pitch of a cue that waits for the context to resume', async () => {
    const ctx = new FakeContext('suspended');
    const backend = createWebAudioBackend(() => ctx as unknown as AudioContext);
    backend.unlock();
    backend.play('stuntStep', 1, 0, 2);
    await Promise.resolve();
    await Promise.resolve();
    const base = SOUNDS.stuntStep.filter((v) => v.wave !== 'noise').map((v) => (v.to ?? v.freq) * 2);
    expect(ctx.oscillators.map((o) => o.frequency.value)).toEqual(base);
  });
});

describe('WebAudio backend: NorDIY park', () => {
  it('builds no park nodes for silence or before unlock', () => {
    const { backend, ctx } = setup();
    backend.setPark(0.5, 0.5);
    backend.unlock();
    const before = ctx.started.length;
    backend.setPark(0, 0);
    expect(ctx.started.length).toBe(before);
  });

  it('builds the park sounds on the first audible level and reuses them while they sound', () => {
    const { backend, ctx } = setup();
    backend.unlock();
    const before = ctx.started.length;
    backend.setPark(0.1, 0);
    const sources = ctx.started.length - before;
    expect(sources).toBeGreaterThan(0);
    expect(ctx.started.slice(before)).toContain('buffer');
    for (let i = 1; i <= 100; i++) backend.setPark(i / 100, i / 100);
    expect(ctx.started.length - before).toBe(sources);
    expect(ctx.stopped).toEqual([]);
  });

  it('stops every park source at silence and leaks none over many park visits', () => {
    const { backend, ctx } = setup();
    backend.unlock();
    const before = ctx.started.length;
    for (let visit = 0; visit < 50; visit++) {
      for (let i = 1; i <= 10; i++) backend.setPark(i / 10, i / 10);
      backend.setPark(0, 0);
      backend.setPark(0, 0);
    }
    const started = ctx.started.length - before;
    expect(started).toBeGreaterThan(0);
    expect(ctx.stopped.length).toBe(started);
  });
});
