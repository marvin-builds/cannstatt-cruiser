import { VIEW_H } from '../core/config';
import { Rng } from '../core/rng';
import type { BaseTile, Prop } from './art/paint';
import { PropStream, type StreamConfig } from './stream';
import { tileStarts } from './tiling';
import { type Depth, type Leg, normalizeZone, type ZoneRoute } from './zones';

/** One zone's look on one parallax depth. */
export interface LayerSpec {
  readonly base?: BaseTile;
  readonly props?: {
    readonly catalogue: Readonly<Record<string, Prop>>;
    readonly stream: StreamConfig;
    /** Screen x of the first prop after a snap (run start, setZone). */
    readonly startAt: number;
  };
  /** Moving things drawn above the base and below the props (e.g. a train), given the layer scroll. */
  readonly vehicle?: (g: CanvasRenderingContext2D, scroll: number, time: number) => void;
}

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
  private seed = 0;
  private restartX = 0;

  constructor(
    private readonly depth: Depth,
    /** Per zone index. */
    private readonly specs: readonly LayerSpec[],
    /** Per zone index: the gateway into that zone. */
    private readonly gateways: readonly Gateway[],
    private readonly salt: number,
  ) {}

  scroll(distance: number): number {
    return distance * this.depth.factor;
  }

  reseed(seed: number): void {
    this.seed = seed;
    this.streams.clear();
  }

  /** The route was snapped at this layer scroll: lay out the zone's intro on screen again. */
  restart(scroll: number): void {
    this.restartX = Math.floor(scroll);
    this.streams.clear();
  }

  draw(g: CanvasRenderingContext2D, route: ZoneRoute, distance: number, time: number, viewWidth: number): void {
    const scroll = this.scroll(distance);
    const s = Math.floor(scroll);
    const legs = route.legs(this.depth, s, s + viewWidth);
    for (const leg of legs) this.drawLeg(g, leg, scroll, time, viewWidth);
    for (const leg of legs) {
      if (leg.index === 0) continue;
      const gate = this.gateways[leg.zone]!;
      gate.prop.draw(g, leg.from - gate.seam - s, time, leg.index);
    }
    for (const index of this.streams.keys()) if (index < legs[0]!.index) this.streams.delete(index);
  }

  warm(): void {
    for (const spec of this.specs) {
      spec.base?.warm();
      for (const prop of Object.values(spec.props?.catalogue ?? {})) prop.warm();
    }
    for (const gate of this.gateways) gate.prop.warm();
  }

  private drawLeg(g: CanvasRenderingContext2D, leg: Leg, scroll: number, time: number, viewWidth: number): void {
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
      for (const x of tileStarts(s, base.period, viewWidth)) g.drawImage(tile, x, base.y);
    }
    vehicle?.(g, scroll, time);
    if (props) {
      for (const p of this.stream(leg).visible(s, s + viewWidth)) propOf(props.catalogue, p.id).draw(g, p.x - s, time, p.seed);
    }
    if (clipped) g.restore();
  }

  private stream(leg: Leg): PropStream {
    let stream = this.streams.get(leg.index);
    if (stream) return stream;
    const props = this.specs[leg.zone]!.props!;
    const into = this.gateways[leg.zone]!;
    const out = this.gateways[normalizeZone(leg.zone + 1)]!;
    const start = leg.index === 0 ? this.restartX + props.startAt : leg.from + into.prop.width - into.seam + GATEWAY_MARGIN;
    const end = leg.to - out.seam - GATEWAY_MARGIN;
    const rng = new Rng(mixSeed(mixSeed(this.seed, this.salt), leg.index));
    stream = new PropStream(props.stream, (id) => propOf(props.catalogue, id).width, rng);
    stream.restart(start, end);
    this.streams.set(leg.index, stream);
    return stream;
  }
}

/** A layer shared by every zone (clouds): one endless stream, with optional drift. */
export class SharedLayer {
  private stream: PropStream | null = null;

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
    for (const p of this.stream.visible(s, s + viewWidth)) propOf(this.props.catalogue, p.id).draw(g, p.x - s, time, p.seed);
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
