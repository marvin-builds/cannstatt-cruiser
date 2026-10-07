/** Allowed size of the view in view pixels: fixed height, width between min and max. */
export interface ViewBounds {
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly height: number;
}

/** How the view maps onto the window. */
export interface Layout {
  /** Device pixels per view pixel. An integer unless the window is smaller than the minimum view. */
  readonly scale: number;
  /** Current view size in view pixels (width adapts to the screen, height is fixed). */
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** Backing-store size of the visible canvas in device pixels. */
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** Size and position of the visible canvas in CSS pixels. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Picks the largest integer device-pixel scale at which the minimum view fits,
 * then widens the view to `floor(deviceWidth / scale)`, clamped to
 * [`minWidth`, `maxWidth`], so only a margin smaller than one view pixel (or
 * the excess beyond `maxWidth`) stays letterboxed. Windows too small for the
 * minimum view get a fractional downscale at `minWidth`.
 */
export function computeLayout(
  windowWidth: number,
  windowHeight: number,
  devicePixelRatio: number,
  bounds: ViewBounds,
): Layout {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const deviceWidth = windowWidth * dpr;
  const deviceHeight = windowHeight * dpr;
  const fitHeight = deviceHeight / bounds.height;
  const fitWidth = deviceWidth / bounds.minWidth;
  const fit = Math.min(fitHeight, fitWidth);
  // Integer device-pixel scale keeps every view pixel the same size (crisp).
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  const viewWidth =
    fit >= 1
      ? Math.min(bounds.maxWidth, Math.max(bounds.minWidth, Math.floor(deviceWidth / scale)))
      : bounds.minWidth;
  const canvasWidth = Math.round(viewWidth * scale);
  const canvasHeight = Math.round(bounds.height * scale);
  const cssWidth = canvasWidth / dpr;
  const cssHeight = canvasHeight / dpr;
  return {
    scale,
    viewWidth,
    viewHeight: bounds.height,
    canvasWidth,
    canvasHeight,
    cssWidth,
    cssHeight,
    offsetX: Math.floor((windowWidth - cssWidth) / 2),
    offsetY: Math.floor((windowHeight - cssHeight) / 2),
  };
}

/** Converts window (client) coordinates to view pixels; may lie outside the view. */
export function screenToView(clientX: number, clientY: number, layout: Layout): { x: number; y: number } {
  const cssPerViewPixel = layout.cssHeight / layout.viewHeight;
  return {
    x: Math.floor((clientX - layout.offsetX) / cssPerViewPixel),
    y: Math.floor((clientY - layout.offsetY) / cssPerViewPixel),
  };
}
