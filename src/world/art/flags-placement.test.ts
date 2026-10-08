import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import type { LayerSpec } from '../scene';
import { PropStream } from '../stream';
import { TrainRunner } from '../train';
import { ZONE_LENGTH } from '../zones';
import { CANNSTATT_FLAG_X, cannstattZone } from './cannstatt';
import { PALESTINE_FLAG, TRANS_FLAG, flagSpan } from './flags';
import { MITTE_FLAG_X, MITTE_TRAIN, mitteZone } from './mitte';

const train = new TrainRunner(new Rng(0), { width: MITTE_TRAIN.width, speed: 70, interval: [9, 20], firstDelay: 0.4 });

const ZONES = [
  { zone: 'Bad Cannstatt', spec: cannstattZone(), flag: PALESTINE_FLAG.name },
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
    { zone: 'Bad Cannstatt', spec: cannstattZone(), house: 'fachwerkAFlag', flag: PALESTINE_FLAG, dx: CANNSTATT_FLAG_X },
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
