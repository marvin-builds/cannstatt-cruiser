/**
 * Pixel art of the items people carry and toss (football, Brezel, Maßkrug,
 * Lebkuchenherz), the foam drops a flying Maßkrug spills, and the items a
 * ball hit knocked onto the street (drop.ts).
 */
import { sprite } from './sprites';
import type { CarriedItem } from '../types';
import type { DroppedItems } from './drop';
import { DROP_TICKS, type ItemToss } from './toss';

const K = '#1a1418';

export const ITEM_SPRITES: Record<CarriedItem, ReturnType<typeof sprite>> = {
  football: sprite({ k: K, w: '#f4f1ea', q: '#2a2a2e' }, [`
    .kkk.
    kwqwk
    kqqqk
    kwqwk
    .kkk.
  `]),
  pretzel: sprite({ k: '#5a2c10', P: '#b8692a', Q: '#e0a050', w: '#f4f1ea' }, [`
    .kk.kk.
    kPQkQPk
    kPkPkPk
    .kPwPk.
    kPk.kPk
    .k...k.
  `]),
  beer: sprite({ k: K, m: '#d8e4e8', F: '#fffbe8', Y: '#f2b632' }, [`
    .FFFF..
    kFFFFk.
    kYYYYkk
    kYYYYkm
    kYYYYkk
    kYYYYk.
    kkkkkk.
  `]),
  gingerbread: sprite({ k: '#4a2410', H: '#a0582a', w: '#f4f1ea', r: '#d8202c' }, [`
    .kk.kk.
    kHHkHHk
    kHrwrHk
    kHwrwHk
    .kHHHk.
    ..kHk..
    ...k...
  `]),
};

const FOAM = '#fffbe8';

export function drawToss(g: CanvasRenderingContext2D, toss: ItemToss): void {
  g.fillStyle = FOAM;
  for (const d of toss.drops) if (d.age < DROP_TICKS - 4 || d.age % 2 === 0) g.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
  const f = toss.flight;
  if (!f) return;
  const art = ITEM_SPRITES[f.item];
  art.draw(g, 0, f.at.x - Math.floor(art.width / 2), f.at.y - Math.floor(art.height / 2));
}

const SHADOW = 'rgba(16, 12, 20, 0.45)';
const GLINT = '#ffffff';
/** A lying item glints for GLINT_TICKS every GLINT_PERIOD ticks, so it reads as something to pick up. */
const GLINT_PERIOD = 40;
const GLINT_TICKS = 6;

/** The dropped items: falling, then lying on the street with a small shadow and a glint (bottom-centred in their box). */
export function drawDrops(g: CanvasRenderingContext2D, drops: DroppedItems, frame: number, lead: number): void {
  for (const d of drops.items) {
    const art = ITEM_SPRITES[d.item];
    const x = Math.round(d.x + d.w / 2 - lead) - Math.floor(art.width / 2);
    const y = Math.round(d.y + d.h) - art.height;
    if (d.lying) {
      g.fillStyle = SHADOW;
      g.fillRect(x, y + art.height, art.width, 1);
    }
    art.draw(g, 0, x, y);
    if (d.lying && frame % GLINT_PERIOD < GLINT_TICKS) {
      g.fillStyle = GLINT;
      g.fillRect(x + art.width - 2, y + 1, 1, 1);
    }
  }
}
