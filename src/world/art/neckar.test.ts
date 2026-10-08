import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import { PropStream } from '../stream';
import { ZONE_LENGTH } from '../zones';
import { MID_FACTOR } from './layout';
import { MOMBACH_FOCUS, mombachquelle } from './mombach';
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

describe('Neckar near layer', () => {
  it('keeps its lamps and trees off the Mombachquelle (people, stair and basin) while it passes', () => {
    const near = neckarZone().layers[2]!.props!;
    expect(near.uncover).toEqual({ id: 'mombachquelle', ...MOMBACH_FOCUS });
    expect(MOMBACH_FOCUS.from).toBeGreaterThanOrEqual(0);
    expect(MOMBACH_FOCUS.to).toBeLessThanOrEqual(mombachquelle.width);
    expect(MOMBACH_FOCUS.to - MOMBACH_FOCUS.from).toBeGreaterThanOrEqual(100);
  });
});
