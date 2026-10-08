/**
 * Art for the stunt pieces (ROADMAP 27): the kicker ramp on the street and
 * the ledges of the upper level, themed by the zone they were planned in
 * (`data.zone`, two looks each by `data.variant`):
 * - 0 Stuttgart-Mitte: a Stäffele railing, a thin Stadtbahn stop roof edge;
 * - 1 Neckar: a sandstone quay wall top, a concrete bridge ledge;
 * - 2 Bad Cannstatt: a fair tent roof edge, a market stall awning.
 * A ledge is a deck tile repeated along its length (its top outline one row
 * above the grind surface, like the rails) on thin, widely spaced posts down
 * to the street, so the street under it reads as free. Composed once per
 * look, length and height (composed.ts).
 */
import { GROUND_Y } from '../core/config';
import type { Sprite } from '../core/sprite';
import type { Entity } from '../types';
import { ComposedCache } from './composed';
import { sprite } from './sprites';

const K = '#1a1418';

/** Plywood ramp rising to the right (the skater rides into it from the left), steel lip on top. */
export const KICKER_SPRITE = sprite({ k: K, T: '#e6bd7c', w: '#b9814a', b: '#8a5a2e', d: '#6d4523', M: '#d4dbe3' }, [
  `
  ...............kkk
  ............kkkMMk
  .........kkkTTTwdk
  ......kkkTTTwwwwdk
  ...kkkTTTwwwbwwwdk
  kkkTTTwwwwwwbwwwdk
  kkkkkkkkkkkkkkkkkk
  `,
]);

interface LedgeLook {
  /** Repeated along the deck; its first row (outline) sits one row above the grind surface. */
  deck: Sprite;
  /** One-row slice of a post, repeated from under the deck down to the foot. */
  post: Sprite;
  foot: Sprite;
  /** Distance between posts (plus one near each end). */
  spacing: number;
}

const STAEFFELE: LedgeLook = {
  deck: sprite({ k: K, L: '#d7e6dc', m: '#6f8f80' }, [['kkkkk', 'LLLLL', 'mmmmm', 'kkkkk', '.k...', '.k...', 'kkkkk', 'mmmmm', 'kkkkk']]),
  post: sprite({ k: K, m: '#6f8f80' }, [['kmk']]),
  foot: sprite({ k: K, s: '#a39d92' }, [['.kkk.', 'ksssk']]),
  spacing: 44,
};

const TRAM_ROOF: LedgeLook = {
  deck: sprite({ k: K, Y: '#ffd84a', y: '#d9a91c', g: '#9cc3d6', G: '#d6eef8' }, [['kkkkkkkk', 'YYYYYYYY', 'yyyyyyyy', 'kkkkkkkk', 'gGgggGgg', 'kkkkkkkk']]),
  post: sprite({ k: K, s: '#8d96a2' }, [['ksk']]),
  foot: sprite({ k: K, s: '#5d646e' }, [['kssk', 'kkkk']]),
  spacing: 56,
};

const QUAY_WALL: LedgeLook = {
  deck: sprite({ k: K, S: '#e2cc9e', s: '#c6aa74', c: '#8f7a52', d: '#7a6646' }, [['kkkkkkkkkk', 'SSSSSSSSSd', 'sssssssssd', 'sssssssssd', 'cccccccccc', 'kkkkkkkkkk']]),
  post: sprite({ k: K, s: '#8f7a52' }, [['ksk']]),
  foot: sprite({ k: K, s: '#8f7a52' }, [['.kkk.', 'ksssk']]),
  spacing: 48,
};

const BRIDGE_LEDGE: LedgeLook = {
  deck: sprite({ k: K, C: '#d3d6d9', c: '#a8adb3', d: '#6f757c' }, [['kkkkkkkkkkkk', 'CCCCCCCCCCCC', 'cccccccccccd', 'dddddddddddd', 'kkkkkkkkkkkk']]),
  post: sprite({ k: K, b: '#4f6a86', B: '#7b97b3' }, [['kBbk']]),
  foot: sprite({ k: K, b: '#4f6a86' }, [['kbbbbk', 'kkkkkk']]),
  spacing: 52,
};

const TENT_ROOF: LedgeLook = {
  deck: sprite({ k: K, W: '#d9a764', w: '#a8743c', U: '#3f7fdc', h: '#f4f1ea' }, [
    ['kkkkkkkk', 'WWWWWWWW', 'wwwwwwww', 'kkkkkkkk', 'UUUUhhhh', 'UUUUhhhh', 'kUUkkhhk', '.kk..kk.'],
  ]),
  post: sprite({ k: K, w: '#a8743c' }, [['kwk']]),
  foot: sprite({ k: K, w: '#7c5428' }, [['kwwk', 'kkkk']]),
  spacing: 40,
};

const STALL_AWNING: LedgeLook = {
  deck: sprite({ k: K, R: '#e84a3c', r: '#b22e24', h: '#f4f1ea', o: '#ffd25a' }, [
    ['kkkkkkkk', 'RRRRRRRR', 'rrrrrrrr', 'kkkkkkkk', 'RRRRhhhh', 'RRRRhhhh', 'kRRkkhhk', '.ko..ko.'],
  ]),
  post: sprite({ k: K, w: '#a8743c' }, [['kwk']]),
  foot: sprite({ k: K, w: '#7c5428' }, [['kwwk', 'kkkk']]),
  spacing: 44,
};

/** Two looks per zone (0 Mitte, 1 Neckar, 2 Bad Cannstatt), at zone * 2 + variant. */
const LOOKS: readonly LedgeLook[] = [STAEFFELE, TRAM_ROOF, QUAY_WALL, BRIDGE_LEDGE, TENT_ROOF, STALL_AWNING];

/** Index of a ledge's look in LOOKS (from its data.zone and data.variant). */
function lookIndex(e: Entity): number {
  const zone = Math.max(0, Math.min(LOOKS.length / 2 - 1, Number(e.data?.zone ?? 0)));
  return zone * 2 + (Number(e.data?.variant ?? 0) % 2);
}

/** Deck tiles, then posts down to the street, into a canvas whose row 0 is one above the grind surface. */
function paintLedge(g: CanvasRenderingContext2D, e: Entity): void {
  const look = LOOKS[lookIndex(e)]!;
  const w = Math.round(e.w);
  const ground = GROUND_Y - Math.round(e.y) + 1;
  const footTop = ground - look.foot.height;
  const postW = look.post.width;
  const post = (px: number) => {
    for (let py = look.deck.height; py < footTop; py++) look.post.draw(g, 0, px, py);
    look.foot.draw(g, 0, px - Math.floor((look.foot.width - postW) / 2), footTop);
  };
  const last = w - postW - 3;
  // Spaced posts, then one near the end (never right beside the one before it).
  for (let px = 3; px < last - look.spacing / 2; px += look.spacing) post(px);
  post(last);
  for (let px = 0; px < w; px += look.deck.width) {
    // The last tile is cut at the ledge's end.
    g.save();
    g.beginPath();
    g.rect(0, 0, w, look.deck.height);
    g.clip();
    look.deck.draw(g, 0, px, 0);
    g.restore();
  }
}

const LEDGES = new ComposedCache<Entity>(12, paintLedge);

/** Draws a kicker or ledge at screen x `x` (its tick x minus the scroll lead, rounded). */
export function drawStunt(g: CanvasRenderingContext2D, e: Entity, x: number): void {
  const y = Math.round(e.y);
  if (e.kind === 'kicker') {
    KICKER_SPRITE.draw(g, 0, x, y);
    return;
  }
  const w = Math.round(e.w);
  const key = (lookIndex(e) * 4096 + w) * 256 + y;
  g.drawImage(LEDGES.get(key, w, GROUND_Y - y + 2, e), x, y - 1);
}

/** Kicker art size (matches catalogue KICKER, checked by art.test.ts). */
export function kickerArtSize(): { w: number; h: number } {
  return { w: KICKER_SPRITE.width, h: KICKER_SPRITE.height };
}
