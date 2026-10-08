/**
 * Offscreen canvases composed once from many sprite draws (a rail's bar
 * slices and posts, an overhead sign's supports), so an entity costs one
 * drawImage per frame instead of hundreds. Cached by a numeric key; the
 * oldest entry goes once the cache is full.
 */
export class ComposedCache<A> {
  private readonly canvases = new Map<number, HTMLCanvasElement>();

  /** `paint(g, arg)` draws the art with its top-left corner at (0, 0). */
  constructor(
    private readonly max: number,
    private readonly paint: (g: CanvasRenderingContext2D, arg: A) => void,
  ) {}

  /** The canvas for `key` (w x h), painted from `arg` the first time. */
  get(key: number, w: number, h: number, arg: A): HTMLCanvasElement {
    let canvas = this.canvases.get(key);
    if (!canvas) {
      if (this.canvases.size >= this.max) this.canvases.delete(this.canvases.keys().next().value!);
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      this.paint(canvas.getContext('2d')!, arg);
      this.canvases.set(key, canvas);
    }
    return canvas;
  }
}
