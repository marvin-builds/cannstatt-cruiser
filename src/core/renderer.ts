import { DEFAULT_LETTERBOX, VIEW_H, VIEW_MAX_W, VIEW_W } from './config';
import { computeLayout, type Layout, type ViewBounds } from './scaling';

const VIEW_BOUNDS: ViewBounds = { minWidth: VIEW_W, maxWidth: VIEW_MAX_W, height: VIEW_H };

/**
 * Owns the visible canvas every system draws into. Its backing store is the
 * view itself (adaptive width x 180); CSS scales it up by the integer
 * device-pixel factor from computeLayout with `image-rendering: pixelated`
 * (index.html). Measured: drawing into a full device-resolution canvas
 * (e.g. 2532x1170 on a phone) made the compositor miss ~78 % of frames on a
 * throttled phone profile, the view-sized canvas < 1 % (docs/TESTING.md).
 */
export class Renderer {
  /** Draw target for systems (view pixels). */
  readonly g: CanvasRenderingContext2D;
  private letterbox = DEFAULT_LETTERBOX;
  layout: Layout;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d', { alpha: false })!;
    this.layout = computeLayout(VIEW_W, VIEW_H, 1, VIEW_BOUNDS);
    this.setLetterboxColor(DEFAULT_LETTERBOX);
    this.resize();
  }

  /** Recomputes the layout (view width, CSS size and position) from the window size and devicePixelRatio. */
  resize(): void {
    const vv = window.visualViewport;
    const width = vv?.width ?? window.innerWidth;
    const height = vv?.height ?? window.innerHeight;
    this.layout = computeLayout(width, height, window.devicePixelRatio || 1, VIEW_BOUNDS);
    const { viewWidth, viewHeight, cssWidth, cssHeight, offsetX, offsetY } = this.layout;
    if (this.canvas.width !== viewWidth || this.canvas.height !== viewHeight) {
      this.canvas.width = viewWidth; // resets the context state
      this.canvas.height = viewHeight;
    }
    this.g.imageSmoothingEnabled = false;
    Object.assign(this.canvas.style, {
      width: `${cssWidth}px`,
      height: `${cssHeight}px`,
      left: `${offsetX}px`,
      top: `${offsetY}px`,
    });
  }

  /** Clears the view to the letterbox colour before systems draw. */
  beginFrame(): void {
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.globalAlpha = 1;
    this.g.fillStyle = this.letterbox;
    this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** PNG data URL of the view scaled up by an integer factor (for inspection). */
  capture(scale = 4): string {
    const out = document.createElement('canvas');
    out.width = this.canvas.width * scale;
    out.height = this.canvas.height * scale;
    const g = out.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  setLetterboxColor(color: string): void {
    this.letterbox = color;
    document.documentElement.style.background = color;
    document.body.style.background = color;
  }
}
