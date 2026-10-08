import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import { PropStream } from '../stream';
import { ZONE_LENGTH } from '../zones';
import { MID_FACTOR } from './layout';
import { neckarZone } from './neckar';

describe('Neckar mid layer', () => {
  it('shows the Mombachquelle exactly once per Neckar stretch', () => {
    const props = neckarZone().layers[1]!.props!;
    // Far longer than a stretch (leg 0 after a snap reaches back forever).
    const stretch = 4 * ZONE_LENGTH * MID_FACTOR;
    for (let seed = 1; seed <= 40; seed++) {
      const stream = new PropStream(props.stream, (id) => props.catalogue[id]!.width, new Rng(seed));
      stream.restart(0);
      const springs = stream.visible(0, stretch).filter((p) => p.id === 'mombachquelle');
      expect(springs).toHaveLength(1);
    }
  });
});
