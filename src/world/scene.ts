import { Rng } from '../core/rng';
import type { BaseTile, Prop } from './art/paint';
import { PropStream, type StreamConfig } from './stream';
import { tileStarts } from './tiling';

/** One parallax layer of a zone, back to front within the zone. */
export interface LayerSpec {
  /** Scroll speed as a fraction of the ground speed (state.speed). */
  readonly factor: number;
  /** Extra drift in layer px per second (clouds). */
  readonly drift?: number;
  readonly base?: BaseTile;
  readonly props?: {
    readonly catalogue: Readonly<Record<string, Prop>>;
    readonly stream: StreamConfig;
    /** Screen x of the first prop after a restart. */
    readonly startAt: number;
  };
  /** Moving things drawn above the base and below the props (e.g. a train), given the layer scroll. */
  readonly vehicle?: (g: CanvasRenderingContext2D, scroll: number, time: number) => void;
}

export interface ZoneSpec {
  readonly name: string;
  /** Pre-rendered sky, VIEW_MAX_W wide, from y 0. */
  readonly sky: () => HTMLCanvasElement;
  readonly layers: readonly LayerSpec[];
}

class Layer {
  private stream: PropStream | null = null;

  constructor(
    readonly spec: LayerSpec,
    private readonly salt: number,
  ) {}

  scroll(distance: number, time: number): number {
    return distance * this.spec.factor + (this.spec.drift ?? 0) * time;
  }

  reseed(seed: number): void {
    const { props } = this.spec;
    if (!props) return;
    const rng = new Rng(mixSeed(seed, this.salt));
    this.stream = new PropStream(props.stream, (id) => propOf(props.catalogue, id).width, rng);
  }

  restart(scroll: number): void {
    if (this.stream && this.spec.props) this.stream.restart(Math.floor(scroll) + this.spec.props.startAt);
  }

  draw(g: CanvasRenderingContext2D, scroll: number, time: number, viewWidth: number): void {
    const s = Math.floor(scroll);
    const { base, props, vehicle } = this.spec;
    if (base) {
      const tile = base.frame(time);
      for (const x of tileStarts(s, base.period, viewWidth)) g.drawImage(tile, x, base.y);
    }
    vehicle?.(g, scroll, time);
    if (props && this.stream) {
      for (const p of this.stream.visible(s, s + viewWidth)) propOf(props.catalogue, p.id).draw(g, p.x - s, time, p.seed);
    }
  }

  warm(): void {
    this.spec.base?.warm();
    for (const prop of Object.values(this.spec.props?.catalogue ?? {})) prop.warm();
  }
}

/** All background layers of one zone (sky to near street), drawn behind the ground. */
export class ZoneScene {
  private readonly layers: Layer[];

  constructor(
    readonly spec: ZoneSpec,
    zoneIndex: number,
  ) {
    this.layers = spec.layers.map((l, i) => new Layer(l, zoneIndex * 16 + i + 1));
  }

  /** New prop sequences for a run seed. */
  reseed(seed: number): void {
    for (const layer of this.layers) layer.reseed(seed);
  }

  /** Lays the zone's intro props out on screen again (zone entry). */
  restart(distance: number, time: number): void {
    for (const layer of this.layers) layer.restart(layer.scroll(distance, time));
  }

  draw(g: CanvasRenderingContext2D, distance: number, time: number, viewWidth: number): void {
    g.drawImage(this.spec.sky(), 0, 0);
    for (const layer of this.layers) layer.draw(g, layer.scroll(distance, time), time, viewWidth);
  }

  warm(): void {
    this.spec.sky();
    for (const layer of this.layers) layer.warm();
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
