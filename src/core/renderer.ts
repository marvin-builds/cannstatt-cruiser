import { DEFAULT_LETTERBOX, VIEW_H, VIEW_W } from './config';
import { computeLayout, type Layout } from './scaling';

/**
 * Owns the 320x180 offscreen buffer every system draws into and the visible
 * canvas it is presented on with integer, nearest-neighbour scaling.
 */
export class Renderer {
  readonly buffer: HTMLCanvasElement;
  /** Draw target for systems (view pixels). */
  readonly g: CanvasRenderingContext2D;
  private readonly screen: CanvasRenderingContext2D;
  private letterbox = DEFAULT_LETTERBOX;
  layout: Layout;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.buffer = document.createElement('canvas');
    this.buffer.width = VIEW_W;
    this.buffer.height = VIEW_H;
    this.g = this.buffer.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
    this.screen = canvas.getContext('2d', { alpha: false })!;
    this.layout = computeLayout(VIEW_W, VIEW_H, 1, VIEW_W, VIEW_H);
    this.setLetterboxColor(DEFAULT_LETTERBOX);
    this.resize();
  }

  /** Recomputes the layout from the current window size and devicePixelRatio. */
  resize(): void {
    const vv = window.visualViewport;
    const width = vv?.width ?? window.innerWidth;
    const height = vv?.height ?? window.innerHeight;
    this.layout = computeLayout(width, height, window.devicePixelRatio || 1, VIEW_W, VIEW_H);
    const { canvasWidth, canvasHeight, cssWidth, cssHeight, offsetX, offsetY } = this.layout;
    if (this.canvas.width !== canvasWidth) this.canvas.width = canvasWidth;
    if (this.canvas.height !== canvasHeight) this.canvas.height = canvasHeight;
    Object.assign(this.canvas.style, {
      width: `${cssWidth}px`,
      height: `${cssHeight}px`,
      left: `${offsetX}px`,
      top: `${offsetY}px`,
    });
  }

  /** Clears the buffer to the letterbox colour before systems draw. */
  beginFrame(): void {
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.globalAlpha = 1;
    this.g.fillStyle = this.letterbox;
    this.g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /** Copies the buffer to the visible canvas, scaled without smoothing. */
  present(): void {
    this.screen.imageSmoothingEnabled = false;
    this.screen.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }

  /** PNG data URL of the buffer scaled up by an integer factor (for inspection). */
  capture(scale = 4): string {
    const out = document.createElement('canvas');
    out.width = VIEW_W * scale;
    out.height = VIEW_H * scale;
    const g = out.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.buffer, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  setLetterboxColor(color: string): void {
    this.letterbox = color;
    document.documentElement.style.background = color;
    document.body.style.background = color;
  }
}
