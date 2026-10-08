/**
 * Art for the Stuttgart-Mitte traffic (logic in ../traffic.ts): cars, vans
 * and buses painted once per kind, colour and facing; exhaust puffs as small
 * fading grey blobs; and a smoggy haze over the city behind the street.
 */
import { GROUND_Y, VIEW_MAX_W } from '../../core/config';
import { LANES, PUFF_LIFE, type Puff, type Traffic, type Vehicle, VEHICLE_VARIANTS, type VehicleKind, VEHICLES, vehicleScreenX } from '../traffic';
import { lazyCanvas, type Painter } from './paint';

const CAR = {
  tyre: '#26282d',
  hub: '#8b9097',
  window: '#3b4756',
  windowLight: '#647a8f',
  head: '#fff2bf',
  tail: '#c93a32',
  trim: '#2f3238',
} as const;

/** Body colour and its shade per variant. */
const BODIES: readonly (readonly [string, string])[] = [
  ['#b9473a', '#93362d'],
  ['#4d72a8', '#3b5a87'],
  ['#e6e1d6', '#bdb7aa'],
  ['#4f7a5c', '#3d6048'],
];
/** Bus liveries: cream with a coloured band. */
const BUS_BANDS: readonly string[] = ['#d0a63c', '#b9473a', '#4d72a8', '#4f7a5c'];
const BUS_BODY = ['#ece6d6', '#c9c2b2'] as const;

const SMOG = '#a39a8c';
const EXHAUST = '#8d8f95';

/** Wheels with a hub, centred on `cx`, sitting on the bottom row. */
function wheel(p: Painter, cx: number, h: number): void {
  p.rect(CAR.tyre, cx - 2, h - 3, 4, 3);
  p.rect(CAR.tyre, cx - 1, h - 4, 2, 1);
  p.px(CAR.hub, cx - 1, h - 2);
}

/** Paints a vehicle facing right (front at the right edge). */
function paintVehicle(p: Painter, kind: VehicleKind, variant: number): void {
  const { w, h } = VEHICLES[kind];
  if (kind === 'bus') return paintBus(p, w, h, variant);
  const [body, shade] = BODIES[variant % BODIES.length]!;
  const deck = h - 6;
  p.rect(body, 0, deck, w, 4);
  p.rect(shade, 0, h - 3, w, 1);
  p.rect(CAR.trim, 0, deck + 3, w, 1);
  if (kind === 'van') {
    p.rect(body, 0, 0, w - 5, deck);
    p.rect(shade, 0, 0, w - 5, 1);
    p.rect(CAR.window, w - 9, 2, 4, deck - 2);
    p.px(CAR.windowLight, w - 9, 2);
    p.rect(shade, 7, 2, 1, deck + 2);
    p.rect(body, w - 5, deck - 1, 4, 1);
  } else {
    const from = kind === 'hatch' ? 2 : 5;
    const to = kind === 'hatch' ? w - 6 : w - 7;
    p.rect(body, from + 1, 0, to - from - 1, 1);
    p.rect(body, from, 1, to - from, deck - 1);
    p.rect(CAR.window, from + 1, 1, to - from - 2, deck - 1);
    p.px(CAR.windowLight, to - 3, 1);
    p.rect(body, Math.floor((from + to) / 2), 1, 1, deck - 1);
  }
  p.px(CAR.head, w - 1, deck + 1);
  p.px(CAR.tail, 0, deck + 1);
  wheel(p, 4, h);
  wheel(p, w - 5, h);
}

function paintBus(p: Painter, w: number, h: number, variant: number): void {
  const [body, shade] = BUS_BODY;
  const band = BUS_BANDS[variant % BUS_BANDS.length]!;
  p.rect(body, 0, 1, w, h - 3);
  p.rect(shade, 1, 0, w - 2, 1);
  p.rect(CAR.window, 2, 3, w - 4, 4);
  for (let x = 8; x < w - 4; x += 7) p.rect(body, x, 3, 1, 4);
  p.rect(CAR.windowLight, w - 3, 3, 2, 4);
  p.rect(band, 0, 8, w, 1);
  p.rect(CAR.window, 12, 3, 3, h - 6);
  p.rect(CAR.window, w - 12, 3, 3, h - 6);
  p.rect(shade, 0, h - 3, w, 1);
  p.px(CAR.head, w - 1, 9);
  p.px(CAR.tail, 0, 9);
  wheel(p, 6, h);
  wheel(p, w - 8, h);
}

/** [kind][variant][0 facing right, 1 facing left] */
const SPRITES = Object.fromEntries(
  (Object.keys(VEHICLES) as VehicleKind[]).map((kind) => {
    const { w, h } = VEHICLES[kind];
    const variants = Array.from({ length: VEHICLE_VARIANTS }, (_, variant) =>
      [false, true].map((flip) =>
        lazyCanvas(w, h, (p) => {
          if (flip) {
            p.g.translate(w, 0);
            p.g.scale(-1, 1);
          }
          paintVehicle(p, kind, variant);
        }),
      ),
    );
    return [kind, variants];
  }),
) as Record<VehicleKind, (() => HTMLCanvasElement)[][]>;

/** Vertical smog gradient over the city, densest towards the street. */
const HAZE = lazyCanvas(VIEW_MAX_W, GROUND_Y, (p) => {
  p.g.fillStyle = SMOG;
  for (let y = 0; y < GROUND_Y; y++) {
    p.g.globalAlpha = 0.1 + 0.42 * Math.pow(y / GROUND_Y, 1.4);
    p.g.fillRect(0, y, VIEW_MAX_W, 1);
  }
});

function drawVehicle(g: CanvasRenderingContext2D, v: Vehicle, scrollLead: number, ahead: number): void {
  const facing = LANES[v.lane]!.dir === 1 ? 0 : 1;
  g.drawImage(SPRITES[v.kind][v.variant]![facing]!(), Math.round(vehicleScreenX(v, scrollLead, ahead)), v.top);
}

/** Puff sizes over its life (w, h per stage): a wisp growing into a soft rounded blob. */
const PUFF_W: readonly number[] = [2, 3, 4, 5];
const PUFF_H: readonly number[] = [1, 2, 3, 4];

/** Puffs grow (top row at p.y, so they never rise above it) and fade out over their life. */
function drawPuff(g: CanvasRenderingContext2D, p: Puff, scrollLead: number): void {
  const t = p.age / PUFF_LIFE;
  const stage = Math.min(PUFF_W.length - 1, Math.floor(t * 1.4 * PUFF_W.length));
  const w = PUFF_W[stage]!;
  const h = PUFF_H[stage]!;
  g.globalAlpha = 0.7 * (1 - t * t);
  const x = Math.round(p.x - scrollLead) - (w >> 1);
  const y = Math.round(p.y);
  if (h < 3) {
    g.fillRect(x, y, w, h);
  } else {
    g.fillRect(x + 1, y, w - 2, h);
    g.fillRect(x, y + 1, w, h - 2);
  }
}

/**
 * Vehicles back lane first, then the exhaust over them, extrapolated for a
 * frame between ticks: `scrollLead` = RenderContext.scrollLead, `ahead` =
 * seconds since the last tick (0 while paused).
 */
export function drawTraffic(g: CanvasRenderingContext2D, traffic: Traffic, scrollLead: number, ahead: number): void {
  const { vehicles, puffs } = traffic;
  for (let lane = 0; lane < LANES.length; lane++) {
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i]!;
      if (v.active && v.lane === lane) drawVehicle(g, v, scrollLead, ahead);
    }
  }
  g.fillStyle = EXHAUST;
  for (let i = 0; i < puffs.length; i++) if (puffs[i]!.active) drawPuff(g, puffs[i]!, scrollLead);
  g.globalAlpha = 1;
}

/** Smog over the city layers behind the street, scaled by the traffic density. */
export function drawHaze(g: CanvasRenderingContext2D, density: number): void {
  if (density <= 0) return;
  g.globalAlpha = density;
  g.drawImage(HAZE(), 0, 0);
  g.globalAlpha = 1;
}

export function warmTraffic(): void {
  HAZE();
  for (const variants of Object.values(SPRITES)) for (const facings of variants) for (const canvas of facings) canvas();
}
