import { NEAR, TRAIN } from '../palette';
import { lazyCanvas, type Painter } from './paint';

/**
 * SSB Stadtbahn (yellow, two cars, big dark window band, pantograph),
 * painted at any size. `car` is one car's length, `h` the body height.
 */
function paintTrain(p: Painter, car: number, h: number, roofTop: number, outline: boolean): void {
  const total = car * 2 + 2;
  const k = outline ? NEAR.outline : TRAIN.yellowShade;
  for (let c = 0; c < 2; c++) {
    const x = c * (car + 2);
    const y = roofTop;
    p.rect(k, x, y, car, h);
    p.rect(TRAIN.yellow, x + 1, y + 1, car - 2, h - 2);
    p.rect(TRAIN.roof, x + 2, y + 1, car - 4, Math.max(1, Math.round(h * 0.12)));
    p.rect(TRAIN.yellowShade, x + 1, y + h - 2 - Math.max(1, Math.round(h * 0.15)), car - 2, 1);
    p.rect(TRAIN.skirt, x + 1, y + h - 1 - Math.max(1, Math.round(h * 0.15)), car - 2, Math.max(1, Math.round(h * 0.15)));
    // Window band with door gaps.
    const wy = y + Math.max(2, Math.round(h * 0.25));
    const wh = Math.max(1, Math.round(h * 0.33));
    p.rect(TRAIN.window, x + 2, wy, car - 4, wh);
    if (h >= 12) {
      for (let d = 0; d < 2; d++) {
        const dx = x + Math.round(car * (d === 0 ? 0.28 : 0.68));
        p.rect(TRAIN.yellowShade, dx, wy, 1, h - (wy - y) - 3);
        p.rect(TRAIN.yellowShade, dx + 5, wy, 1, h - (wy - y) - 3);
        p.rect(TRAIN.window, dx + 1, wy, 4, wh + 4);
      }
      for (let i = x + 4; i < x + car - 4; i += 7) p.px(TRAIN.windowLight, i, wy);
    }
    // Bogies.
    const by = y + h;
    p.rect(TRAIN.bogie, x + 3, by, Math.max(3, Math.round(car * 0.2)), Math.max(1, Math.round(h * 0.12)));
    p.rect(TRAIN.bogie, x + car - 3 - Math.max(3, Math.round(car * 0.2)), by, Math.max(3, Math.round(car * 0.2)), Math.max(1, Math.round(h * 0.12)));
  }
  // Rounded cab fronts with headlights.
  for (const x of [0, total - 1]) {
    p.g.clearRect(x, roofTop, 1, 1);
    p.g.clearRect(x, roofTop + h - 1, 1, 1);
  }
  p.px(TRAIN.light, 1, roofTop + h - 3 - Math.max(1, Math.round(h * 0.15)));
  p.px(TRAIN.light, total - 2, roofTop + h - 3 - Math.max(1, Math.round(h * 0.15)));
  // Pantograph on the first car.
  const px = Math.round(car * 0.45);
  const ph = Math.max(2, Math.round(h * 0.35));
  p.line(NEAR.iron, px, roofTop - 1, px + ph, roofTop - ph);
  p.line(NEAR.iron, px + ph * 2, roofTop - 1, px + ph, roofTop - ph);
  p.rect(NEAR.iron, px + ph - 2, roofTop - ph - 1, 5, 1);
}

export interface TrainArt {
  readonly width: number;
  readonly height: number;
  readonly canvas: () => HTMLCanvasElement;
}

/** Train image whose bottom row is the wheel line. */
export function stadtbahn(car: number, h: number, outline: boolean): TrainArt {
  const pantograph = Math.max(2, Math.round(h * 0.35)) + 1;
  const bogie = Math.max(1, Math.round(h * 0.12));
  const width = car * 2 + 2;
  const height = pantograph + h + bogie;
  return { width, height, canvas: lazyCanvas(width, height, (p) => paintTrain(p, car, h, pantograph, outline)) };
}
