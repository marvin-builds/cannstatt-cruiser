import { GROUND_Y, VIEW_MAX_W } from '../../core/config';
import { gradientColor } from '../color';
import { CLOUD, SKY_BANDS } from '../palette';
import { lazyCanvas, type Painter, type Prop } from './paint';

/** Smooth vertical sky gradient through the zone's colour stops (one colour per row: no dots, no bands). */
export function skyCanvas(zone: number): () => HTMLCanvasElement {
  const stops = SKY_BANDS[zone]!;
  return lazyCanvas(VIEW_MAX_W, GROUND_Y, (p) => {
    for (let y = 0; y < GROUND_Y; y++) p.rect(gradientColor(stops, y, GROUND_Y), 0, y, VIEW_MAX_W, 1);
  });
}

function puffs(p: Painter, w: number, h: number, salt: number): void {
  const blobs: Array<[number, number, number]> = [];
  const count = Math.max(2, Math.round(w / 12));
  for (let i = 0; i < count; i++) {
    const cx = Math.round(((i + 0.5) / count) * (w - 8)) + 4;
    const r = Math.round(3 + (h - 6) * Math.sin((Math.PI * (i + 0.5)) / count) * (0.7 + 0.3 * ((salt * (i + 3)) % 7) / 7));
    blobs.push([cx, h - 3 - Math.round(r * 0.6), r]);
  }
  for (const [cx, cy, r] of blobs) p.ellipse(CLOUD.shade, cx, cy + 1, r, Math.round(r * 0.7));
  for (const [cx, cy, r] of blobs) p.ellipse(CLOUD.mid, cx, cy, r, Math.round(r * 0.7));
  for (const [cx, cy, r] of blobs) p.ellipse(CLOUD.light, cx - 1, cy - 1, Math.max(1, r - 2), Math.max(1, Math.round(r * 0.5)));
  // Flat underside: cut everything below it, then a shade line.
  p.g.clearRect(0, h - 2, w, 2);
  const left = blobs[0]![0] - blobs[0]![2] + 2;
  const right = blobs.at(-1)![0] + blobs.at(-1)![2] - 2;
  p.rect(CLOUD.shade, left, h - 3, right - left + 1, 1);
}

/** A flat-bottomed pixel cloud; its height in the sky comes from the placement seed. */
function cloud(w: number, h: number, salt: number): Prop {
  const canvas = lazyCanvas(w, h, (p) => puffs(p, w, h, salt));
  return {
    width: w,
    draw: (g, x, _time, seed) => g.drawImage(canvas(), x, 8 + (seed % 46)),
    warm: () => void canvas(),
  };
}

export const CLOUDS: Readonly<Record<string, Prop>> = {
  cloudSmall: cloud(26, 12, 3),
  cloudMid: cloud(40, 15, 5),
  cloudWide: cloud(58, 16, 2),
};
