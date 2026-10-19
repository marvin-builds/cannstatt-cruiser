import { describe, expect, it } from 'vitest';
import { VIEW_MAX_W } from '../../core/config';
import { Rng } from '../../core/rng';
import { DepthLayer, type GatewayTable, type LayerSpec, type ZoneSpec } from '../scene';
import { PropStream } from '../stream';
import { TrainRunner } from '../train';
import { ZONE_LENGTH, ZoneRoute } from '../zones';
import { CANNSTATT_FLAG_X, cannstattZone } from './cannstatt';
import { type FlagSpec, PST_FLAG, TRANS_FLAG, flagSpan } from './flags';
import { gatewayTable } from './gateways';
import { FAR_DEPTH, MID_DEPTH, NEAR_DEPTH } from './layout';
import { MITTE_FLAG_X, MITTE_TRAIN, mitteZone } from './mitte';
import { neckarZone } from './neckar';
import type { Prop } from './paint';

const train = new TrainRunner(new Rng(0), { width: MITTE_TRAIN.width, speed: 70, interval: [9, 20], firstDelay: 0.4 });

const ZONES = [
  { zone: 'Bad Cannstatt', spec: cannstattZone(), flag: PST_FLAG.name },
  { zone: 'Stuttgart-Mitte', spec: mitteZone(train), flag: TRANS_FLAG.name },
];

/** Every flag hanging in a zone visit on one layer: the flag names of the placed props. */
function flagsInVisit(layer: LayerSpec, seed: number, stretch: number): string[] {
  const props = layer.props;
  if (!props) return [];
  const stream = new PropStream(props.stream, (id) => props.catalogue[id]!.width, new Rng(seed));
  stream.restart(0, stretch);
  return stream.visible(0, stretch).flatMap((p) => props.catalogue[p.id]!.flag ?? []);
}

describe('zone flags', () => {
  for (const { zone, spec, flag } of ZONES) {
    it(`hangs the ${flag} flag exactly once per ${zone} visit, on every layer together`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        // A whole leg on each layer (and far more for the parallax-slow ones).
        const flags = spec.layers.flatMap((layer) => flagsInVisit(layer, seed, ZONE_LENGTH));
        expect(flags).toEqual([flag]);
      }
    });

    it(`keeps the ${flag} flag out of the ${zone} fillers and landmarks (no second flagged house)`, () => {
      for (const layer of spec.layers) {
        const props = layer.props;
        if (!props) continue;
        const { fillers, landmarks, intro } = props.stream;
        for (const id of [...fillers, ...landmarks]) expect(props.catalogue[id]!.flag).toBeUndefined();
        expect(intro.filter((id) => props.catalogue[id]!.flag).length).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe('street props leave the flag uncovered', () => {
  const CASES = [
    { zone: 'Bad Cannstatt', spec: cannstattZone(), house: 'fachwerkAFlag', flag: PST_FLAG, dx: CANNSTATT_FLAG_X },
    { zone: 'Stuttgart-Mitte', spec: mitteZone(train), house: 'housesBFlag', flag: TRANS_FLAG, dx: MITTE_FLAG_X },
  ];
  for (const { zone, spec, house, flag, dx } of CASES) {
    it(`keeps the ${zone} Litfasssaeule, lamps and trees off the ${flag.name} flag while it passes`, () => {
      const [, mid, near] = spec.layers;
      const uncover = near!.props!.uncover!;
      expect(uncover).toEqual({ id: house, ...flagSpan(flag, dx) });
      expect(uncover.to).toBeLessThanOrEqual(mid!.props!.catalogue[house]!.width);
    });
  }
});

/** A prop drawn this frame: its catalogue id, screen x and width. */
interface Drawn {
  id: string;
  x: number;
  w: number;
}

/** `prop`'s width and flag, recording its draws into `out` instead of painting. */
function recorder(id: string, prop: Prop, out: Drawn[]): Prop {
  return { width: prop.width, flag: prop.flag, draw: (_g, x) => void out.push({ id, x, w: prop.width }), warm: () => undefined };
}

function recordedLayer(layer: LayerSpec, out: Drawn[]): LayerSpec {
  if (!layer.props) return {};
  const catalogue = Object.fromEntries(Object.entries(layer.props.catalogue).map(([id, prop]) => [id, recorder(id, prop, out)]));
  return { props: { ...layer.props, catalogue } };
}

function silentGateways(depth: number): GatewayTable {
  return gatewayTable(depth).map((row) => row.map((gate) => gate && { prop: recorder('gateway', gate.prop, []), seam: gate.seam }));
}

const g = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, drawImage() {} } as unknown as CanvasRenderingContext2D;

/** The flag and its house-local x of each flagged mid-layer house, by catalogue id. */
const FLAGGED: Record<string, { flag: FlagSpec; dx: number }> = {
  fachwerkAFlag: { flag: PST_FLAG, dx: CANNSTATT_FLAG_X },
  housesBFlag: { flag: TRANS_FLAG, dx: MITTE_FLAG_X },
};

/**
 * Rides a whole run of `legCount` legs from the start (as the world does:
 * reseed, then a snap to the start zone at distance 0) at the widest view.
 * Returns the flag names hung on each leg (by mid-layer x, each house once)
 * and checks every frame that no near prop covers a flag on screen.
 */
function rideRun(seed: number, legCount: number): { flags: string[][]; covered: number } {
  const zones: ZoneSpec[] = [mitteZone(train), neckarZone(), cannstattZone()];
  const drawn = [[], [], []] as Drawn[][];
  const depths = [FAR_DEPTH, MID_DEPTH, NEAR_DEPTH];
  const layers: DepthLayer[] = [];
  depths.forEach((depth, d) => {
    layers.push(new DepthLayer(depth, zones.map((z) => recordedLayer(z.layers[d]!, drawn[d]!)), silentGateways(d), d + 2, layers[d - 1]));
  });
  const route = new ZoneRoute();
  route.snap(2, 0);
  for (const layer of layers) {
    layer.reseed(seed);
    layer.restart(0);
  }
  const flags = Array.from({ length: legCount }, () => [] as string[]);
  const seen = new Set<string>();
  let covered = 0;
  for (let d = 0; d < route.boundary(legCount); d += 3) {
    for (const list of drawn) list.length = 0;
    layers.forEach((layer) => layer.draw(g, route, d, 0, 0, VIEW_MAX_W));
    const s = Math.floor(d * MID_DEPTH.factor);
    for (const house of drawn[1]!) {
      const flagged = FLAGGED[house.id];
      if (!flagged) continue;
      const layerX = house.x + s;
      const leg = route.legs(MID_DEPTH, layerX, layerX + 1).at(0).index;
      const key = `${house.id}@${layerX}`;
      if (!seen.has(key) && leg < legCount) flags[leg]!.push(flagged.flag.name);
      seen.add(key);
      const span = flagSpan(flagged.flag, flagged.dx);
      const from = house.x + span.from;
      const to = house.x + span.to;
      if (to <= 0 || from >= VIEW_MAX_W) continue;
      covered += drawn[2]!.filter((p) => p.x < to && p.x + p.w > from).length;
    }
  }
  return { flags, covered };
}

describe('flags over a whole run', () => {
  // Legs: Cannstatt, Neckar, Mitte, Neckar, Cannstatt, Neckar, Mitte, Neckar, Cannstatt.
  const LEGS = 9;
  for (const seed of [1, 7, 23]) {
    it(`hangs the PST flag only from the second Bad Cannstatt visit on, the trans flag every Mitte visit (seed ${seed})`, () => {
      const { flags, covered } = rideRun(seed, LEGS);
      expect(flags).toEqual([[], [], [TRANS_FLAG.name], [], [PST_FLAG.name], [], [TRANS_FLAG.name], [], [PST_FLAG.name]]);
      expect(covered).toBe(0);
    });
  }
});
