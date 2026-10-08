import { VIEW_H, VIEW_MAX_W } from '../core/config';
import { Rng } from '../core/rng';
import type { BaseTile, Prop } from './art/paint';
import { type Placement, PropStream, type StreamConfig } from './stream';
import { firstTileX } from './tiling';
import { type Depth, type Leg, LegList, type ZoneRoute } from './zones';

/** One zone's look on one parallax depth. */
export interface LayerSpec {
  readonly base?: BaseTile;
  readonly props?: {
    readonly catalogue: Readonly<Record<string, Prop>>;
    readonly stream: StreamConfig;
    /** Screen x of the first prop after a snap (run start, setZone). */
    readonly startAt: number;
    /** Keeps this layer's props off a scene on the layer behind while it passes the screen. */
    readonly uncover?: Uncover;
  };
  /**
   * Moving things drawn above the base and below the props (e.g. a train),
   * given the layer scroll and `ahead` = seconds since the last tick (to
   * extrapolate their own motion in a frame between ticks).
   */
  readonly vehicle?: (g: CanvasRenderingContext2D, scroll: number, ahead: number) => void;
}

/**
 * A part of an intro prop on the layer behind (prop-local x range [from, to))
 * that this layer's props never cover, whatever the view width: this layer
 * scrolls faster, so it keeps a stretch free of props for as long as that
 * part is on screen.
 */
export interface Uncover {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

/** Extra px kept clear on both sides of an uncovered span (scroll rounding). */
const UNCOVER_MARGIN = 2;

/** A zone: its sky and its far, mid and near layers (same order as the world's depths). */
export interface ZoneSpec {
  readonly name: string;
  /** Pre-rendered sky, VIEW_MAX_W wide, from y 0. */
  readonly sky: () => HTMLCanvasElement;
  readonly layers: readonly LayerSpec[];
}

/** Art that hides a seam on one depth; `seam` is the x inside the prop where the zones meet. */
export interface Gateway {
  readonly prop: Prop;
  readonly seam: number;
}

/** One depth's gateways, indexed [from zone][to zone]; null where the route never crosses. */
export type GatewayTable = readonly (readonly (Gateway | null)[])[];

/** Space kept between a gateway and the props of the zones on either side. */
const GATEWAY_MARGIN = 4;

/**
 * One parallax depth across all zones. Each zone's stretch (leg) is drawn
 * clipped to its own layer range with its own prop stream, bounded so no
 * prop crosses a seam; the gateway prop of the zone being entered covers the
 * seam itself. The next zone thus scrolls in from the right with the layer.
 */
export class DepthLayer {
  private readonly streams = new Map<number, PropStream>();
  /** Lowest leg index that may still have a stream (older ones are dropped once passed). */
  private oldestLeg = 0;
  private seed = 0;
  private restartX = 0;
  /** Reused every frame, so drawing allocates nothing. */
  private readonly legs = new LegList();
  private readonly placements: Placement[] = [];
  private readonly lookup = new LegList();

  constructor(
    private readonly depth: Depth,
    /** Per zone index. */
    private readonly specs: readonly LayerSpec[],
    private readonly gateways: GatewayTable,
    private readonly salt: number,
    /** The layer behind this one (for LayerSpec uncover). */
    private readonly behind?: DepthLayer,
  ) {}

  scroll(distance: number): number {
    return distance * this.depth.factor;
  }

  reseed(seed: number): void {
    this.seed = seed;
    this.clearStreams();
  }

  /** The route was snapped at this layer scroll: lay out the zone's intro on screen again. */
  restart(scroll: number): void {
    this.restartX = Math.floor(scroll);
    this.clearStreams();
  }

  /**
   * Draws the layer at ground distance `distance` (RenderContext.scroll, so
   * it moves evenly between ticks); `ahead` = seconds since the last tick.
   */
  draw(g: CanvasRenderingContext2D, route: ZoneRoute, distance: number, time: number, ahead: number, viewWidth: number): void {
    const scroll = this.scroll(distance);
    const s = Math.floor(scroll);
    const legs = route.legs(this.depth, s, s + viewWidth, this.legs);
    for (let i = 0; i < legs.count; i++) this.drawLeg(g, route, legs.at(i), scroll, time, ahead, viewWidth);
    for (let i = 0; i < legs.count; i++) {
      const leg = legs.at(i);
      if (leg.index === 0) continue;
      const gate = this.gateway(leg.previous, leg.zone);
      gate.prop.draw(g, leg.from - gate.seam - s, time, leg.index);
    }
    this.dropPassedStreams(legs.at(0).index);
  }

  warm(): void {
    for (const spec of this.specs) {
      spec.base?.warm();
      for (const prop of Object.values(spec.props?.catalogue ?? {})) prop.warm();
    }
    for (const row of this.gateways) for (const gate of row) gate?.prop.warm();
  }

  /** Layer x of intro prop `id` on route leg `k` of this layer, or null if that leg's zone has none. */
  introX(route: ZoneRoute, k: number, id: string): number | null {
    this.lookup.clear();
    const leg = route.leg(this.depth, k, this.lookup.next());
    if (!this.specs[leg.zone]!.props?.stream.intro.includes(id)) return null;
    return this.stream(route, leg).introX(id);
  }

  private gateway(from: number, to: number): Gateway {
    const gate = this.gateways[from]?.[to];
    if (!gate) throw new Error(`No gateway from zone ${from} to zone ${to}`);
    return gate;
  }

  private clearStreams(): void {
    this.streams.clear();
    this.oldestLeg = 0;
  }

  /** Forgets the streams of legs left behind (only when a new leg became the first on screen). */
  private dropPassedStreams(firstLeg: number): void {
    if (firstLeg <= this.oldestLeg) return;
    for (let index = this.oldestLeg; index < firstLeg; index++) this.streams.delete(index);
    this.oldestLeg = firstLeg;
  }

  private drawLeg(g: CanvasRenderingContext2D, route: ZoneRoute, leg: Leg, scroll: number, time: number, ahead: number, viewWidth: number): void {
    const s = Math.floor(scroll);
    const left = Math.max(0, leg.from - s);
    const right = Math.min(viewWidth, leg.to - s);
    if (right <= left) return;
    const { base, props, vehicle } = this.specs[leg.zone]!;
    const clipped = left > 0 || right < viewWidth;
    if (clipped) {
      g.save();
      g.beginPath();
      g.rect(left, 0, right - left, VIEW_H);
      g.clip();
    }
    if (base) {
      const tile = base.frame(time);
      for (let x = firstTileX(s, base.period); x < viewWidth; x += base.period) g.drawImage(tile, x, base.y);
    }
    vehicle?.(g, scroll, ahead);
    if (props) {
      const visible = this.stream(route, leg).visible(s, s + viewWidth, this.placements);
      for (let i = 0; i < visible.length; i++) {
        const p = visible[i]!;
        propOf(props.catalogue, p.id).draw(g, p.x - s, time, p.seed);
      }
    }
    if (clipped) g.restore();
  }

  private stream(route: ZoneRoute, leg: Leg): PropStream {
    let stream = this.streams.get(leg.index);
    if (stream) return stream;
    const props = this.specs[leg.zone]!.props!;
    const into = this.gateway(leg.previous, leg.zone);
    const out = this.gateway(leg.zone, leg.next);
    const start = leg.index === 0 ? this.restartX + props.startAt : leg.from + into.prop.width - into.seam + GATEWAY_MARGIN;
    const end = leg.to - out.seam - GATEWAY_MARGIN;
    const rng = new Rng(mixSeed(mixSeed(this.seed, this.salt), leg.index));
    stream = new PropStream(props.stream, (id) => propOf(props.catalogue, id).width, rng);
    stream.restart(start, end);
    if (props.uncover) this.uncover(stream, route, leg.index, props.uncover);
    this.streams.set(leg.index, stream);
    return stream;
  }

  /**
   * Keeps `stream` off the layer x range in which a prop would pass over the
   * uncovered part [x + from, x + to) of the scene behind while that part is
   * on screen. With r = this factor / behind factor, a prop at layer x n
   * (width w) and the part meet on screen only if n + w > r (x + from) -
   * (r - 1) viewWidth and n < r (x + to); the widest view bounds it.
   */
  private uncover(stream: PropStream, route: ZoneRoute, k: number, { id, from, to }: Uncover): void {
    if (!this.behind) throw new Error(`Layer uncovers "${id}" but has no layer behind it`);
    const x = this.behind.introX(route, k, id);
    if (x === null) return;
    const r = this.depth.factor / this.behind.depth.factor;
    stream.keepClear(r * (x + from) - (r - 1) * VIEW_MAX_W - UNCOVER_MARGIN, r * (x + to) + UNCOVER_MARGIN);
  }
}

/** A layer shared by every zone (clouds): one endless stream, with optional drift. */
export class SharedLayer {
  private stream: PropStream | null = null;
  private readonly placements: Placement[] = [];

  constructor(
    private readonly factor: number,
    private readonly drift: number,
    private readonly props: NonNullable<LayerSpec['props']>,
    private readonly salt: number,
  ) {}

  scroll(distance: number, time: number): number {
    return distance * this.factor + this.drift * time;
  }

  reseed(seed: number, scroll: number): void {
    const rng = new Rng(mixSeed(seed, this.salt));
    this.stream = new PropStream(this.props.stream, (id) => propOf(this.props.catalogue, id).width, rng);
    this.stream.restart(Math.floor(scroll) + this.props.startAt);
  }

  draw(g: CanvasRenderingContext2D, distance: number, time: number, viewWidth: number): void {
    if (!this.stream) return;
    const s = Math.floor(this.scroll(distance, time));
    const visible = this.stream.visible(s, s + viewWidth, this.placements);
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i]!;
      propOf(this.props.catalogue, p.id).draw(g, p.x - s, time, p.seed);
    }
  }

  warm(): void {
    for (const prop of Object.values(this.props.catalogue)) prop.warm();
  }
}

function propOf(catalogue: Readonly<Record<string, Prop>>, id: string): Prop {
  const prop = catalogue[id];
  if (!prop) throw new Error(`World prop "${id}" is missing from its layer catalogue`);
  return prop;
}

/** Derives an independent seed per layer so layers never share an rng sequence. */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}
