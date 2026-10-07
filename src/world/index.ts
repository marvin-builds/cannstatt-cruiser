/**
 * World slice: parallax Stuttgart backgrounds and the riding surface at
 * GROUND_Y. Zones follow a fixed, distance-driven route: every layer streams
 * the next zone in from the right at its own parallax speed (near first, far
 * last), gateway art hides each seam, and the sky palette blends over several
 * seconds. Purely visual apart from `state.zoneIndex` (see docs/ARCHITECTURE.md).
 */
import { Rng } from '../core/rng';
import type { GameContext, RenderContext, System } from '../types';
import { cannstattZone } from './art/cannstatt';
import { GATEWAYS } from './art/gateways';
import { GROUND_TILES } from './art/ground';
import { CLOUD_DRIFT, CLOUD_FACTOR, CLOUD_PROPS, FAR_DEPTH, MID_DEPTH, NEAR_DEPTH } from './art/layout';
import { MITTE_TRAIN, mitteZone } from './art/mitte';
import { neckarZone } from './art/neckar';
import { GroundStrip } from './ground';
import { LETTERBOX } from './palette';
import { DepthLayer, mixSeed, SharedLayer } from './scene';
import { TrainRunner } from './train';
import { ZoneRoute } from './zones';

/** Zone of the near-layer Stadtbahn (Stuttgart-Mitte). */
const TRAIN_ZONE = 0;
const DEPTHS = [FAR_DEPTH, MID_DEPTH, NEAR_DEPTH];

export function createWorldSystem(): System {
  const route = new ZoneRoute();
  const trainRng = new Rng(0);
  const train = new TrainRunner(trainRng, { width: MITTE_TRAIN.width, speed: 70, interval: [9, 20], firstDelay: 0.4 });
  const zones = [mitteZone(train), neckarZone(), cannstattZone()];
  const clouds = new SharedLayer(CLOUD_FACTOR, CLOUD_DRIFT, CLOUD_PROPS, 1);
  const layers = DEPTHS.map(
    (depth, d) =>
      new DepthLayer(
        depth,
        zones.map((z) => z.layers[d]!),
        GATEWAYS.map((gates) => gates[d]!),
        d + 2,
      ),
  );
  const ground = new GroundStrip(GROUND_TILES);
  /** Animation clock (s): runs in every mode except pause. */
  let time = 0;
  let warmed = false;
  /** True while the world itself announces a zone it rode into (no snap then). */
  let advancing = false;

  function snap(zone: number, distance: number): void {
    route.snap(zone, distance);
    for (const layer of layers) layer.restart(layer.scroll(distance));
    if (zone === TRAIN_ZONE) train.restart();
  }

  function reset(seed: number): void {
    for (const layer of layers) layer.reseed(seed);
    clouds.reseed(seed, clouds.scroll(0, time));
    trainRng.seed(mixSeed(seed, 99));
    snap(0, 0);
  }

  /** The train only sets off where the track (a Mitte leg) reaches past the right edge. */
  function trainEnabled(distance: number, viewWidth: number): boolean {
    const spawn = distance * NEAR_DEPTH.factor + viewWidth + 4 + MITTE_TRAIN.width;
    return route.legAtLayer(NEAR_DEPTH, spawn).zone === TRAIN_ZONE;
  }

  function drawSky(g: CanvasRenderingContext2D, distance: number): void {
    const { from, to, t } = route.blend(distance);
    g.drawImage(zones[from]!.sky(), 0, 0);
    if (from === to || t <= 0) return;
    g.globalAlpha = t;
    g.drawImage(zones[to]!.sky(), 0, 0);
    g.globalAlpha = 1;
  }

  function drawBackground({ g, state, display }: RenderContext): void {
    if (!warmed) {
      zones.forEach((z) => z.sky());
      clouds.warm();
      layers.forEach((l) => l.warm());
      ground.warm();
      warmed = true;
    }
    const { viewWidth } = display;
    drawSky(g, state.distance);
    clouds.draw(g, state.distance, time, viewWidth);
    for (const layer of layers) layer.draw(g, route, state.distance, time, viewWidth);
  }

  return {
    name: 'world',

    init(ctx: GameContext) {
      ctx.commands.setLetterboxColor(LETTERBOX);
      reset(ctx.state.seed);
      ctx.bus.on('runStarted', ({ seed }) => reset(seed));
      ctx.bus.on('zoneChanged', ({ index }) => {
        if (!advancing) snap(index, ctx.state.distance);
      });
    },

    update(ctx, dt) {
      const { state } = ctx;
      if (state.mode === 'playing') {
        const zone = route.zoneAt(state.distance);
        if (zone !== state.zoneIndex) {
          advancing = true;
          try {
            ctx.commands.setZone(zone);
          } finally {
            advancing = false;
          }
        }
      }
      if (state.mode === 'paused') return;
      time += dt;
      train.update(dt, state.distance * NEAR_DEPTH.factor, ctx.display.viewWidth, trainEnabled(state.distance, ctx.display.viewWidth));
    },

    render: {
      background: drawBackground,
      world: ({ g, state, display }) => ground.draw(g, route, state.distance, display.viewWidth),
    },
  };
}
