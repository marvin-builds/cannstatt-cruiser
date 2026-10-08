import { describe, expect, it } from 'vitest';
import { FrameProbe } from './perf';

describe('FrameProbe', () => {
  it('records frames with per-system costs and dumps them as plain objects', () => {
    const probe = new FrameProbe(['world', 'ui'], 4);
    probe.beginFrame(100, 16.7);
    probe.addSystem(0, 'update', 1.5);
    probe.addSystem(0, 'update', 0.5);
    probe.addSystem(1, 'render', 2);
    probe.endFrame({ updates: 2, updateMs: 2.1, renderMs: 2.2, distance: 12.5, scroll: 13, heap: 1000 });
    const dump = probe.dump();
    expect(dump.systems).toEqual(['world', 'ui']);
    expect(dump.frames).toEqual([
      {
        t: 100,
        elapsed: 16.7,
        updates: 2,
        updateMs: 2.1,
        renderMs: 2.2,
        distance: 12.5,
        scroll: 13,
        heap: 1000,
        update: { world: 2, ui: 0 },
        render: { world: 0, ui: 2 },
      },
    ]);
  });

  it('stops recording when full instead of growing', () => {
    const probe = new FrameProbe([], 2);
    for (let i = 0; i < 5; i++) {
      probe.beginFrame(i, 1);
      probe.endFrame({ updates: 1, updateMs: 0, renderMs: 0, distance: 0, scroll: 0, heap: 0 });
    }
    expect(probe.dump().frames.map((f) => f.t)).toEqual([0, 1]);
    expect(probe.full).toBe(true);
  });
});
