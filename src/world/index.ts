/**
 * World slice: parallax Stuttgart backgrounds and the riding surface at
 * GROUND_Y. Zones follow a fixed, distance-driven route that starts in Bad
 * Cannstatt and rides back and forth (Cannstatt <-> Neckar <-> Mitte): every
 * layer streams the next zone in from the right at its own parallax speed
 * (near first, far last), gateway art hides each seam, and the sky palette
 * blends over several seconds. The foreground street has light traffic (a
 * single car now and then); Stuttgart-Mitte makes it dense and big (below the riding line: the back lane and the exhaust
 * clouds under every entity, the front lane in the fx layer over them but
 * below everything gameplay draws) and adds a smoggy haze. Purely visual apart from
 * `state.zoneIndex`, `state.trafficDensity` and the `vehiclePassed` event
 * (see docs/ARCHITECTURE.md).
 * Everything that scrolls is drawn from RenderContext.scroll / scrollLead, so
 * it moves evenly on 120/144 Hz displays; render allocates nothing per frame.
 */
import { START_ZONE, TICK_DT } from '../core/config';
import { Rng } from '../core/rng';
import { testHookEnabled } from '../core/testhook';
import type { GameContext, GameMode, RenderContext, System } from '../types';
import { cannstattZone } from './art/cannstatt';
import { gatewayTable } from './art/gateways';
import { GROUND_TILES } from './art/ground';
import { CLOUD_DRIFT, CLOUD_FACTOR, CLOUD_PROPS, FAR_DEPTH, MID_DEPTH, NEAR_DEPTH } from './art/layout';
import { MITTE_TRAIN, mitteZone } from './art/mitte';
import { neckarZone } from './art/neckar';
import { drawBackTraffic, drawFrontTraffic, drawHaze, warmTraffic } from './art/traffic';
import { installWorldDebug } from './debug';
import { GroundStrip } from './ground';
import { LETTERBOX } from './palette';
import { DepthLayer, mixSeed, SharedLayer } from './scene';
import { mitteShare, type PassListener, Traffic, trafficDensity } from './traffic';
import { TrainRunner } from './train';
import { type PaletteBlend, ZoneRoute } from './zones';

/** Zone of the near-layer Stadtbahn (Stuttgart-Mitte). */
const TRAIN_ZONE = 0;
const DEPTHS = [FAR_DEPTH, MID_DEPTH, NEAR_DEPTH];
/** The smog haze goes over the layers behind this one (the near street stays clear). */
const HAZE_BEFORE_LAYER = 2;

/** The world system plus read-only ambience for other systems (e.g. traffic noise). */
export interface WorldSystem extends System {
  /**
   * Traffic density as drawn: 1 in Stuttgart-Mitte, LIGHT_TRAFFIC elsewhere,
   * ramping in and out with Mitte (the traffic stays on screen on game over). Other systems
   * read `state.trafficDensity`, which is 0 on the title and game over.
   */
  trafficDensity(): number;
}

export function createWorldSystem(): WorldSystem {
  const route = new ZoneRoute();
  const trainRng = new Rng(0);
  const train = new TrainRunner(trainRng, { width: MITTE_TRAIN.width, speed: 70, interval: [9, 20], firstDelay: 0.4 });
  const zones = [mitteZone(train), neckarZone(), cannstattZone()];
  const clouds = new SharedLayer(CLOUD_FACTOR, CLOUD_DRIFT, CLOUD_PROPS, 1);
  const layers: DepthLayer[] = [];
  DEPTHS.forEach((depth, d) =>
    layers.push(
      new DepthLayer(
        depth,
        zones.map((z) => z.layers[d]!),
        gatewayTable(d),
        d + 2,
        layers[d - 1],
      ),
    ),
  );
  const ground = new GroundStrip(GROUND_TILES);
  const trafficRng = new Rng(0);
  const traffic = new Traffic(trafficRng);
  /** Animation clock (s): runs in every mode except pause. */
  let time = 0;
  let warmed = false;
  /** True while the world itself announces a zone it rode into (no snap then). */
  let advancing = false;
  let density = 0;
  /** Distance seen by the last update, to scroll the traffic with the street. */
  let lastDistance = 0;
  let lastMode: GameMode | null = null;
  const blend: PaletteBlend = { from: START_ZONE, to: START_ZONE, t: 1 };
  /** Announces pass-bys while a run is playing (set in init, once the bus is known). */
  let announcePass: PassListener | undefined;

  function snap(zone: number, distance: number): void {
    route.snap(zone, distance);
    for (const layer of layers) layer.restart(layer.scroll(distance));
    if (zone === TRAIN_ZONE) train.restart();
    traffic.reset();
  }

  function reset(seed: number): void {
    for (const layer of layers) layer.reseed(seed);
    clouds.reseed(seed, clouds.scroll(0, time));
    trainRng.seed(mixSeed(seed, 99));
    trafficRng.seed(mixSeed(seed, 77));
    lastDistance = 0;
    snap(START_ZONE, 0);
  }

  /** Core starts every run in zone 0: on the first tick the world announces the zone it starts in. */
  function syncZone(ctx: GameContext): void {
    const zone = route.zoneAt(ctx.state.distance);
    if (zone === ctx.state.zoneIndex) return;
    advancing = true;
    try {
      ctx.commands.setZone(zone);
    } finally {
      advancing = false;
    }
  }

  /** The train only sets off where the track (a Mitte leg) reaches past the right edge. */
  function trainEnabled(distance: number, viewWidth: number): boolean {
    const spawn = distance * NEAR_DEPTH.factor + viewWidth + 4 + MITTE_TRAIN.width;
    return route.zoneAtLayer(NEAR_DEPTH, spawn) === TRAIN_ZONE;
  }

  /** Seconds since the last tick the frame shows (moving things are extrapolated by it); 0 while paused. */
  function ahead({ state, alpha }: RenderContext): number {
    return state.mode === 'paused' ? 0 : alpha * TICK_DT;
  }

  function drawSky(g: CanvasRenderingContext2D, distance: number): void {
    const { from, to, t } = route.blend(distance, blend);
    g.drawImage(zones[from]!.sky(), 0, 0);
    if (from === to || t <= 0) return;
    g.globalAlpha = t;
    g.drawImage(zones[to]!.sky(), 0, 0);
    g.globalAlpha = 1;
  }

  function drawBackground(r: RenderContext): void {
    const { g, scroll, display } = r;
    if (!warmed) {
      zones.forEach((z) => z.sky());
      clouds.warm();
      layers.forEach((l) => l.warm());
      ground.warm();
      warmTraffic();
      warmed = true;
    }
    const { viewWidth } = display;
    const lead = ahead(r);
    drawSky(g, scroll);
    clouds.draw(g, scroll, time + lead, viewWidth);
    for (let d = 0; d < layers.length; d++) {
      if (d === HAZE_BEFORE_LAYER) drawHaze(g, mitteShare(density));
      layers[d]!.draw(g, route, scroll, time, lead, viewWidth);
    }
  }

  function drawStreet(r: RenderContext): void {
    ground.draw(r.g, route, r.scroll, r.display.viewWidth);
    drawBackTraffic(r.g, traffic, r.scrollLead, ahead(r));
  }

  function drawNearTraffic(r: RenderContext): void {
    drawFrontTraffic(r.g, traffic, r.scrollLead, ahead(r));
  }

  return {
    name: 'world',

    trafficDensity: () => density,

    init(ctx: GameContext) {
      ctx.commands.setLetterboxColor(LETTERBOX);
      reset(ctx.state.seed);
      announcePass = (pass) => ctx.bus.emit('vehiclePassed', { ...pass });
      if (typeof window !== 'undefined' && testHookEnabled()) installWorldDebug(traffic, () => density);
      ctx.bus.on('runStarted', ({ seed }) => reset(seed));
      ctx.bus.on('zoneChanged', ({ index }) => {
        if (!advancing) snap(index, ctx.state.distance);
      });
    },

    update(ctx, dt) {
      const { state, display } = ctx;
      // Back on the title the scenery starts over in Bad Cannstatt.
      if (state.mode === 'title' && lastMode !== 'title' && lastMode !== null) snap(START_ZONE, state.distance);
      lastMode = state.mode;
      if (state.mode === 'playing') syncZone(ctx);
      if (state.mode === 'paused') return;
      time += dt;
      train.update(dt, state.distance * NEAR_DEPTH.factor, display.viewWidth, trainEnabled(state.distance, display.viewWidth));
      const scroll = Math.max(0, state.distance - lastDistance);
      lastDistance = state.distance;
      density = trafficDensity(route, state.distance);
      state.trafficDensity = state.mode === 'playing' ? density : 0;
      // Pass-bys are heard only while playing (state density is 0 on the title and game over).
      traffic.update(dt, scroll, density, display.viewWidth, state.mode === 'playing' ? announcePass : undefined);
    },

    render: {
      background: drawBackground,
      world: drawStreet,
      fx: drawNearTraffic,
    },
  };
}
