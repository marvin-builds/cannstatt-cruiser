/**
 * Art for the street traffic (logic in ../traffic.ts): cars, vans,
 * city buses and trucks close to the camera, painted once per kind, colour
 * and facing; headlight beams for a honk flash; dithered, see-through exhaust
 * clouds pre-rendered per size; and a smoggy haze over the city behind the
 * street. The back lane and the clouds go under gameplay (world layer), the
 * front lane over it (fx layer, below everything gameplay draws).
 */
import { GROUND_Y, VIEW_MAX_W } from '../../core/config';
import {
  FLASH_TIME,
  LANES,
  PUFF_LIFE,
  type Puff,
  type Traffic,
  type Vehicle,
  VEHICLE_VARIANTS,
  type VehicleKind,
  VEHICLES,
  vehicleScreenX,
} from '../traffic';
import { lazyCanvas, type Painter } from './paint';

const CAR = {
  tyre: '#24262b',
  tyreLight: '#3a3d44',
  hub: '#9a9fa6',
  window: '#33404f',
  windowLight: '#5f7489',
  glint: '#a9bccb',
  head: '#fff2bf',
  tail: '#d23a30',
  trim: '#2b2e34',
  arch: '#1c1e22',
  chrome: '#c8ccd1',
  amber: '#f0a83a',
} as const;

/** Body colour, shade and highlight per variant. */
const BODIES: readonly (readonly [string, string, string])[] = [
  ['#c0473a', '#943429', '#d8695a'],
  ['#4a70a8', '#375685', '#6b8fc2'],
  ['#e8e3d8', '#bdb7aa', '#f7f4ec'],
  ['#4f7c5c', '#3b5f46', '#6c9a78'],
];
/** City bus liveries: cream body with a coloured band per variant (no logos). */
const BUS_BANDS: readonly string[] = ['#d8a634', '#c0473a', '#4a70a8', '#4f7c5c'];
const BUS_BODY = ['#efe9da', '#c9c2b2', '#fbf8ef'] as const;
/** Truck box colours per variant. */
const BOXES: readonly (readonly [string, string])[] = [
  ['#e9e6de', '#c4c0b6'],
  ['#d8a634', '#b48722'],
  ['#5f7d93', '#4b6577'],
  ['#b9473a', '#93362d'],
];

const SMOG = '#a39a8c';
const EXHAUST = ['#9a9ca3', '#7d8088', '#b8bac0'] as const;
const BEAM = '#fff4c6';

/** Tyre with a hub, centred on `cx`, its bottom on the vehicle's bottom row. */
function wheel(p: Painter, cx: number, h: number): void {
  p.rect(CAR.arch, cx - 5, h - 9, 10, 2);
  p.disc(CAR.tyre, cx, h - 4, 4);
  p.rect(CAR.tyreLight, cx - 2, h - 8, 4, 1);
  p.rect(CAR.hub, cx - 1, h - 5, 2, 2);
}

/** Lower body shared by cars and vans: sill shade, bumpers, lights; the deck starts at `deck`. */
function lowerBody(p: Painter, w: number, h: number, deck: number, body: string, shade: string, light: string): void {
  p.rect(body, 0, deck, w, h - 3 - deck);
  p.rect(light, 1, deck, w - 2, 1);
  p.rect(shade, 0, h - 5, w, 2);
  p.rect(CAR.trim, 0, h - 3, w, 1);
  p.rect(CAR.trim, w - 3, h - 6, 3, 2);
  p.rect(CAR.trim, 0, h - 6, 2, 2);
  p.rect(CAR.head, w - 2, deck + 1, 2, 2);
  p.px(CAR.amber, w - 1, deck + 3);
  p.rect(CAR.tail, 0, deck + 1, 2, 2);
}

/** Hatchback or sedan facing right. */
function paintCar(p: Painter, w: number, h: number, kind: 'hatch' | 'sedan', variant: number): void {
  const [body, shade, light] = BODIES[variant % BODIES.length]!;
  const deck = h - 10;
  const from = kind === 'hatch' ? 3 : 8;
  const to = kind === 'hatch' ? w - 10 : w - 12;
  // Cabin: sloped pillars, windows, a roof highlight.
  for (let y = 0; y < deck; y++) {
    const slopeBack = kind === 'hatch' ? Math.max(0, 2 - y) : Math.max(0, 3 - y) * 2;
    const slopeFront = Math.max(0, deck - y - 1) * 2;
    const x0 = from + slopeBack - (kind === 'hatch' ? 0 : 2);
    const x1 = to + 6 - slopeFront;
    p.rect(body, x0, y, x1 - x0, 1);
    if (y >= 2) p.rect(CAR.window, x0 + 2, y, x1 - x0 - 4, 1);
  }
  p.rect(light, from + 2, 0, to - from, 1);
  const pillar = Math.floor((from + to) / 2) + 2;
  p.rect(body, pillar, 2, 2, deck - 2);
  p.px(CAR.glint, to + 1, 2);
  p.px(CAR.windowLight, to + 2, 3);
  p.px(CAR.windowLight, from + 4, 2);
  lowerBody(p, w, h, deck, body, shade, light);
  // Door seams and handles.
  p.rect(shade, pillar, deck + 1, 1, h - deck - 6);
  if (kind === 'sedan') p.rect(shade, pillar - 11, deck + 1, 1, h - deck - 6);
  p.rect(CAR.chrome, pillar + 3, deck + 2, 2, 1);
  p.rect(CAR.chrome, pillar - 6, deck + 2, 2, 1);
  wheel(p, 7, h);
  wheel(p, w - 8, h);
}

/** Delivery van facing right: tall box with a sloped windscreen. */
function paintVan(p: Painter, w: number, h: number, variant: number): void {
  const [body, shade, light] = BODIES[variant % BODIES.length]!;
  const deck = h - 10;
  p.rect(body, 0, 0, w - 8, deck);
  p.rect(light, 1, 0, w - 10, 1);
  for (let y = 2; y < deck; y++) {
    const x1 = w - Math.max(0, deck - y - 1);
    p.rect(body, w - 8, y, x1 - (w - 8), 1);
    p.rect(CAR.window, w - 12, y, x1 - (w - 12) - 2, 1);
  }
  p.rect(body, w - 8, 1, 2, 1);
  p.px(CAR.glint, w - 9, 3);
  p.rect(shade, w - 15, 1, 1, h - 6);
  p.rect(shade, 14, 1, 1, h - 6);
  p.rect(light, 3, 3, 8, deck - 4);
  p.rect(body, 4, 4, 6, deck - 6);
  lowerBody(p, w, h, deck, body, shade, light);
  p.rect(CAR.chrome, w - 19, deck + 2, 2, 1);
  wheel(p, 8, h);
  wheel(p, w - 9, h);
}

/** City bus facing right: window row, coloured band, doors and a lit destination strip. */
function paintBus(p: Painter, w: number, h: number, variant: number): void {
  const [body, shade, light] = BUS_BODY;
  const band = BUS_BANDS[variant % BUS_BANDS.length]!;
  p.rect(body, 0, 1, w, h - 4);
  p.rect(light, 2, 0, w - 4, 1);
  p.rect(shade, 4, 1, w - 12, 1);
  // Window row with pillars, windscreen and destination strip.
  p.rect(CAR.window, 3, 5, w - 6, 8);
  for (let x = 13; x < w - 8; x += 11) p.rect(body, x, 5, 2, 8);
  p.rect(CAR.windowLight, 4, 5, w - 8, 1);
  for (let x = 6; x < w - 8; x += 11) p.px(CAR.glint, x, 6);
  p.rect(CAR.window, w - 4, 3, 3, 11);
  p.rect(CAR.trim, w - 18, 2, 14, 2);
  p.rect(CAR.amber, w - 16, 2, 9, 1);
  p.rect(band, 0, 14, w, 2);
  // Doors (front and middle).
  for (const x of [w - 15, Math.floor(w / 2) - 4]) {
    p.rect(CAR.window, x, 5, 8, h - 9);
    p.rect(shade, x + 4, 5, 1, h - 9);
    p.rect(CAR.windowLight, x + 1, 6, 1, h - 11);
  }
  p.rect(shade, 0, h - 5, w, 2);
  p.rect(CAR.trim, 0, h - 3, w, 1);
  p.rect(CAR.head, w - 2, h - 9, 2, 2);
  p.rect(CAR.tail, 0, h - 9, 2, 3);
  wheel(p, 12, h);
  wheel(p, w - 22, h);
  wheel(p, w - 12, h);
}

/** Truck facing right: cab with a sleeper and exhaust stack, a plain box trailer. */
function paintTruck(p: Painter, w: number, h: number, variant: number): void {
  const [cab, cabShade, cabLight] = BODIES[variant % BODIES.length]!;
  const [box, boxShade] = BOXES[variant % BOXES.length]!;
  const cabW = 20;
  const boxW = w - cabW - 2;
  p.rect(box, 0, 0, boxW, h - 7);
  p.rect(boxShade, 0, 0, boxW, 1);
  p.rect(boxShade, 0, h - 9, boxW, 2);
  for (let x = 8; x < boxW; x += 12) p.rect(boxShade, x, 2, 1, h - 12);
  p.rect(CAR.trim, 0, h - 7, w - 2, 2);
  // Cab: sleeper top, windscreen, door, stack.
  const cx = boxW + 2;
  p.rect(CAR.trim, cx - 2, 0, 1, 3);
  p.rect(CAR.chrome, cx - 2, 3, 1, h - 10);
  p.rect(cab, cx, 3, cabW, h - 8);
  p.rect(cabLight, cx + 1, 3, cabW - 2, 1);
  p.rect(CAR.window, cx + 9, 5, cabW - 10, 7);
  p.rect(CAR.window, cx + 2, 5, 5, 5);
  p.px(CAR.glint, cx + 10, 6);
  p.rect(cabShade, cx + 8, 4, 1, h - 10);
  p.rect(cabShade, cx, h - 7, cabW, 2);
  p.rect(CAR.trim, cx + cabW - 3, h - 9, 3, 2);
  p.rect(CAR.head, w - 2, h - 12, 2, 2);
  p.rect(CAR.tail, 0, h - 11, 2, 2);
  wheel(p, 9, h);
  wheel(p, 20, h);
  wheel(p, cx + 4, h);
  wheel(p, w - 6, h);
}

/** Paints a vehicle facing right (front at the right edge). */
function paintVehicle(p: Painter, kind: VehicleKind, variant: number): void {
  const { w, h } = VEHICLES[kind];
  if (kind === 'bus') paintBus(p, w, h, variant);
  else if (kind === 'truck') paintTruck(p, w, h, variant);
  else if (kind === 'van') paintVan(p, w, h, variant);
  else paintCar(p, w, h, kind, variant);
}

/** Row (from the roof) of the headlight per kind, where a flash beam starts. */
const LIGHT_Y: Record<VehicleKind, number> = {
  hatch: VEHICLES.hatch.h - 9,
  sedan: VEHICLES.sedan.h - 9,
  van: VEHICLES.van.h - 9,
  bus: VEHICLES.bus.h - 9,
  truck: VEHICLES.truck.h - 12,
};

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

const BEAM_W = 14;
const BEAM_H = 7;
/** Headlight flash: a bright core and a fading, dithered cone; [0 facing right, 1 facing left]. */
const BEAMS = [false, true].map((flip) =>
  lazyCanvas(BEAM_W, BEAM_H, (p) => {
    if (flip) {
      p.g.translate(BEAM_W, 0);
      p.g.scale(-1, 1);
    }
    const mid = BEAM_H >> 1;
    p.rect('#ffffff', 0, mid - 1, 2, 2);
    for (let x = 1; x < BEAM_W; x++) {
      const half = Math.min(mid, Math.floor(x / 3));
      for (let y = mid - 1 - half; y <= mid + half; y++) if ((x + y) % 2 === 0 || x < 5) p.px(BEAM, x, y);
    }
  }),
);

/** Smog over the city, densest towards the street. */
const HAZE = lazyCanvas(VIEW_MAX_W, GROUND_Y, (p) => {
  p.g.fillStyle = SMOG;
  for (let y = 0; y < GROUND_Y; y++) {
    p.g.globalAlpha = 0.1 + 0.42 * Math.pow(y / GROUND_Y, 1.4);
    p.g.fillRect(0, y, VIEW_MAX_W, 1);
  }
});

/** Cloud sizes over its life (w, h per stage); big = a bus's or truck's diesel cloud. */
const CLOUD_SIZES: readonly (readonly [number, number])[] = [
  [6, 4],
  [9, 6],
  [12, 8],
  [16, 10],
  [20, 13],
  [24, 15],
  [28, 18],
];
const SMALL_STAGES = 4;

/** Lobes of a cumulus puff as (centre x, centre y, radius) in fractions of its width and height. */
const LOBES: readonly (readonly [number, number, number])[] = [
  [0.3, 0.62, 0.3],
  [0.52, 0.42, 0.4],
  [0.74, 0.6, 0.27],
  [0.5, 0.7, 0.32],
];

/**
 * Soft round puff built from overlapping lobes: a lit top, a mid body and a
 * darker underside, with a sparse ordered dither only on the outermost ring
 * so the edge looks soft instead of jagged. Drawn translucent under gameplay.
 */
const CLOUDS = CLOUD_SIZES.map(([w, h]) =>
  lazyCanvas(w, h, (p) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let inside = 0;
        for (const [lx, ly, lr] of LOBES) {
          const dx = (x + 0.5 - lx * w) / (lr * w);
          const dy = (y + 0.5 - ly * h) / (lr * h * 1.25);
          inside = Math.max(inside, 1 - (dx * dx + dy * dy));
        }
        if (inside <= 0) continue;
        if (inside < 0.18 && ((x + y) & 1) === 1) continue;
        const v = y / h;
        p.px(v < 0.35 ? EXHAUST[2] : v > 0.72 ? EXHAUST[1] : EXHAUST[0], x, y);
      }
    }
  }),
);

function drawVehicle(g: CanvasRenderingContext2D, v: Vehicle, scrollLead: number, ahead: number, shake: number): void {
  const facing = LANES[v.lane]!.dir === 1 ? 0 : 1;
  const { w } = VEHICLES[v.kind];
  const x = Math.round(vehicleScreenX(v, scrollLead, ahead));
  const y = v.top + shake;
  g.drawImage(SPRITES[v.kind][v.variant]![facing]!(), x, y);
  // Two short blinks per flash.
  if (v.flash <= 0 || Math.floor((v.flash / FLASH_TIME) * 4) % 2 === 1) return;
  const ly = y + LIGHT_Y[v.kind] - (BEAM_H >> 1) + 1;
  g.drawImage(BEAMS[facing]!(), facing === 0 ? x + w - 1 : x - BEAM_W + 1, ly);
}

/** Clouds grow (top row at p.y, so they never rise above it), drift and fade out over their life. */
function drawPuff(g: CanvasRenderingContext2D, p: Puff, scrollLead: number): void {
  const t = p.age / PUFF_LIFE;
  const stages = p.big ? CLOUD_SIZES.length : SMALL_STAGES;
  const stage = Math.min(stages - 1, Math.floor(Math.sqrt(t) * stages));
  const w = CLOUD_SIZES[stage]![0];
  g.globalAlpha = 0.85 * (1 - t * t);
  g.drawImage(CLOUDS[stage]!(), Math.round(p.x - scrollLead) - (w >> 1), Math.round(p.y));
}

function drawLane(g: CanvasRenderingContext2D, traffic: Traffic, lane: number, scrollLead: number, ahead: number): void {
  const { vehicles, shake } = traffic;
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i]!;
    if (v.active && v.lane === lane) drawVehicle(g, v, scrollLead, ahead, shake);
  }
}

/**
 * Under gameplay (world layer): the back lanes, then the exhaust clouds over
 * them, which may drift up above the riding line because every entity and
 * the skater are drawn on top. Extrapolated for a frame between ticks:
 * `scrollLead` = RenderContext.scrollLead, `ahead` = seconds since the last
 * tick (0 while paused).
 */
export function drawBackTraffic(g: CanvasRenderingContext2D, traffic: Traffic, scrollLead: number, ahead: number): void {
  for (let lane = 0; lane < LANES.length; lane++) if (!LANES[lane]!.front) drawLane(g, traffic, lane, scrollLead, ahead);
  const { puffs } = traffic;
  for (let i = 0; i < puffs.length; i++) if (puffs[i]!.active) drawPuff(g, puffs[i]!, scrollLead);
  g.globalAlpha = 1;
}

/** Over gameplay (fx layer): the front lane, which stays below everything gameplay draws (FRONT_TOP). */
export function drawFrontTraffic(g: CanvasRenderingContext2D, traffic: Traffic, scrollLead: number, ahead: number): void {
  for (let lane = 0; lane < LANES.length; lane++) if (LANES[lane]!.front) drawLane(g, traffic, lane, scrollLead, ahead);
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
  BEAMS.forEach((b) => b());
  CLOUDS.forEach((c) => c());
  for (const variants of Object.values(SPRITES)) for (const facings of variants) for (const canvas of facings) canvas();
}
