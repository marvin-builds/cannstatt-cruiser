/**
 * World slice: parallax Stuttgart backgrounds per zone, zone cycling with a
 * dithered crossfade, and the riding surface at GROUND_Y. Purely visual
 * apart from `state.zoneIndex` (see docs/ARCHITECTURE.md).
 */
import { Rng } from '../core/rng';
import type { GameContext, RenderContext, System } from '../types';
import { cannstattZone } from './art/cannstatt';
import { GROUND_TILES } from './art/ground';
import { NEAR_FACTOR } from './art/layout';
import { MITTE_TRAIN, mitteZone } from './art/mitte';
import { neckarZone } from './art/neckar';
import { DitherCompositor } from './compose';
import { Crossfade } from './crossfade';
import { GroundStrip } from './ground';
import { LETTERBOX } from './palette';
import { mixSeed, ZoneScene } from './scene';
import { TrainRunner } from './train';
import { normalizeZone, ZoneClock } from './zones';

/** Zone of the near-layer Stadtbahn (Stuttgart-Mitte). */
const TRAIN_ZONE = 0;

export function createWorldSystem(): System {
  const clock = new ZoneClock();
  const fade = new Crossfade(0);
  const trainRng = new Rng(0);
  const train = new TrainRunner(trainRng, { width: MITTE_TRAIN.width, speed: 70, interval: [9, 20], firstDelay: 0.4 });
  const scenes = [mitteZone(train), neckarZone(), cannstattZone()].map((spec, i) => new ZoneScene(spec, i));
  const ground = new GroundStrip(GROUND_TILES);
  const compositor = new DitherCompositor();
  /** Animation clock (s): runs in every mode except pause. */
  let time = 0;
  let warmed = false;

  function reset(seed: number): void {
    clock.reset(0);
    fade.snap(0);
    ground.snap(0);
    for (const scene of scenes) scene.reseed(seed);
    scenes[0]!.restart(0, time);
    trainRng.seed(mixSeed(seed, 99));
    train.restart();
  }

  function enterZone(ctx: GameContext, index: number): void {
    const zone = normalizeZone(index);
    const { distance } = ctx.state;
    clock.reset(distance);
    if (zone === fade.to) return;
    fade.start(zone);
    scenes[zone]!.restart(distance, time);
    ground.change(zone, distance);
    if (zone === TRAIN_ZONE) train.restart();
  }

  function drawBackground({ g, state, display }: RenderContext): void {
    if (!warmed) {
      scenes.forEach((s) => s.warm());
      ground.warm();
      warmed = true;
    }
    const { viewWidth } = display;
    const draw = (target: CanvasRenderingContext2D, zone: number) => scenes[zone]!.draw(target, state.distance, time, viewWidth);
    if (!fade.active) {
      draw(g, fade.to);
      return;
    }
    draw(g, fade.from);
    compositor.blend(g, fade.progress, viewWidth, (target) => draw(target, fade.to));
  }

  return {
    name: 'world',

    init(ctx) {
      ctx.commands.setLetterboxColor(LETTERBOX);
      reset(ctx.state.seed);
      ctx.bus.on('runStarted', ({ seed }) => reset(seed));
      ctx.bus.on('zoneChanged', ({ index }) => enterZone(ctx, index));
    },

    update(ctx, dt) {
      const { state } = ctx;
      if (state.mode === 'playing') {
        const next = clock.due(state.distance, state.zoneIndex);
        if (next !== null) ctx.commands.setZone(next);
      }
      if (state.mode === 'paused') return;
      time += dt;
      fade.update(dt);
      train.update(dt, state.distance * NEAR_FACTOR, ctx.display.viewWidth, fade.to === TRAIN_ZONE);
    },

    render: {
      background: drawBackground,
      world: ({ g, state, display }) => ground.draw(g, state.distance, display.viewWidth),
    },
  };
}
