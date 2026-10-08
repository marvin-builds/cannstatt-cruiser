import { describe, expect, it } from 'vitest';
import type { Prop } from './art/paint';
import { DepthLayer, type GatewayTable, type LayerSpec } from './scene';
import { type Depth, ZONE_COUNT, ZONE_LENGTH, ZoneRoute } from './zones';

const MID: Depth = { factor: 0.3, seamAt: 250 };
const NEAR: Depth = { factor: 0.6, seamAt: 64 };
/** Part of the scene (prop-local x) the near layer must never cover. */
const FOCUS = { from: 10, to: 116 };

/** A prop that only records where it was drawn this frame (screen x and width). */
function recorder(width: number, drawn: Span[]): Prop {
  return { width, draw: (_g, x) => void drawn.push({ x, w: width }), warm: () => undefined };
}

interface Span {
  x: number;
  w: number;
}

/** True if a near prop drawn at `prop` covers the focus of the scene drawn at `scene`. */
function covers(prop: Span, scene: Span): boolean {
  return prop.x < scene.x + FOCUS.to && prop.x + prop.w > scene.x + FOCUS.from;
}

function onScreen(scene: Span, viewWidth: number): boolean {
  return scene.x + FOCUS.to > 0 && scene.x + FOCUS.from < viewWidth;
}

const g = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, drawImage() {} } as unknown as CanvasRenderingContext2D;

function gateways(width: number): GatewayTable {
  const gate = { prop: recorder(width, []), seam: Math.floor(width / 2) };
  return Array.from({ length: ZONE_COUNT }, () => Array.from({ length: ZONE_COUNT }, () => gate));
}

function scene(seed: number) {
  const springs: Span[] = [];
  const lamps: Span[] = [];
  const spring = recorder(160, springs);
  const mid: LayerSpec = {
    props: {
      catalogue: { spring, bush: recorder(20, []) },
      stream: { intro: ['bush', 'spring'], landmarks: [], fillers: ['bush'], gap: [6, 28], fillersBetween: [0, 0] },
      startAt: 10,
    },
  };
  const near: LayerSpec = {
    props: {
      catalogue: { lamp: recorder(8, lamps), tree: recorder(26, lamps) },
      stream: { intro: ['tree'], landmarks: [], fillers: ['lamp', 'tree'], gap: [24, 70], fillersBetween: [0, 0] },
      startAt: 4,
      uncover: { id: 'spring', ...FOCUS },
    },
  };
  const plain: LayerSpec = { props: { ...near.props!, uncover: undefined } };
  const midPlain: LayerSpec = { props: { ...mid.props!, stream: { ...mid.props!.stream, intro: ['bush'] } } };
  // Only the Neckar (zone 1) has the scene, and only there the near layer uncovers it.
  const midLayer = new DepthLayer(MID, [midPlain, mid, midPlain], gateways(40), 3);
  const nearLayer = new DepthLayer(NEAR, [plain, near, plain], gateways(30), 4, midLayer);
  midLayer.reseed(seed);
  nearLayer.reseed(seed);
  return { midLayer, nearLayer, springs, lamps };
}

/** Rides `route` from `from` to `to`, calling `check` with the spring and near-prop screen xs of each frame. */
function ride(seed: number, route: ZoneRoute, from: number, to: number, viewWidth: number, check: (springs: Span[], props: Span[]) => void): void {
  const { midLayer, nearLayer, springs, lamps } = scene(seed);
  midLayer.restart(midLayer.scroll(from));
  nearLayer.restart(nearLayer.scroll(from));
  for (let d = from; d < to; d += 1.7) {
    springs.length = 0;
    lamps.length = 0;
    midLayer.draw(g, route, d, 0, 0, viewWidth);
    nearLayer.draw(g, route, d, 0, 0, viewWidth);
    check(springs, lamps);
  }
}

describe('DepthLayer uncover (near props keep off a scene on the layer behind)', () => {
  it.each([320, 427])('never draws a near prop over the scene while it passes (view %i)', (viewWidth) => {
    for (let seed = 1; seed <= 12; seed++) {
      const route = new ZoneRoute();
      route.snap(2, 0);
      let seen = 0;
      let props = 0;
      // Cannstatt -> Neckar -> Mitte -> Neckar: both Neckar legs, entered through a gateway.
      ride(seed, route, 0, 4 * ZONE_LENGTH, viewWidth, (springs, near) => {
        props += near.length;
        for (const s of springs) {
          if (!onScreen(s, viewWidth)) continue;
          seen++;
          for (const p of near) if (covers(p, s)) expect({ seed, spring: s, prop: p }).toBeNull();
        }
      });
      expect(seen).toBeGreaterThan(100);
      expect(props).toBeGreaterThan(1000);
    }
  });

  it('also keeps the scene clear right after a snap into the zone', () => {
    const route = new ZoneRoute();
    route.snap(1, 500);
    let seen = 0;
    ride(5, route, 500, 500 + ZONE_LENGTH / 2, 427, (springs, near) => {
      for (const s of springs) {
        if (!onScreen(s, 427)) continue;
        seen++;
        for (const p of near) expect(covers(p, s)).toBe(false);
      }
    });
    expect(seen).toBeGreaterThan(50);
  });
});
