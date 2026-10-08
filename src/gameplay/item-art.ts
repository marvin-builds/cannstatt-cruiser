/**
 * Pixel art of the items people carry and toss (football, Brezel, Maßkrug,
 * Lebkuchenherz) and the foam drops a flying Maßkrug spills.
 */
import { sprite } from '../core/sprite';
import type { CarriedItem } from '../types';
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
