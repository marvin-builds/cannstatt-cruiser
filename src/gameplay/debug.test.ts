import { afterEach, describe, expect, it, vi } from 'vitest';
import { GROUND_Y } from '../core/config';
import { installGameplayDebug } from './debug';
import { DroppedItems } from './drop';
import { quietGame } from './test-kit';

describe('gameplay debug hook (window.__gameplay)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the dropped items read-only: item, box and whether it lies on the street', () => {
    vi.stubGlobal('window', {});
    const drops = new DroppedItems();
    installGameplayDebug(quietGame().ctx, drops);
    expect(window.__gameplay!.drops()).toEqual([]);

    drops.drop('pretzel', { x: 200, y: GROUND_Y - 20 }, 120, () => true);
    const [seen] = window.__gameplay!.drops();
    const d = drops.items[0]!;
    expect(seen).toEqual({ item: 'pretzel', x: d.x, y: d.y, w: d.w, h: d.h, lying: false });

    // A snapshot: changing it leaves the game alone.
    seen!.x = -999;
    expect(drops.items[0]!.x).toBe(d.x);
  });
});
