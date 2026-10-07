/** How the 320x180 view maps onto the window. */
export interface Layout {
  /** Device pixels per view pixel. An integer unless the window is smaller than the view. */
  readonly scale: number;
  /** Backing-store size of the visible canvas in device pixels. */
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** Size and position of the visible canvas in CSS pixels. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export function computeLayout(
  windowWidth: number,
  windowHeight: number,
  devicePixelRatio: number,
  viewWidth: number,
  viewHeight: number,
): Layout {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const fit = Math.min((windowWidth * dpr) / viewWidth, (windowHeight * dpr) / viewHeight);
  // Integer device-pixel scale keeps every view pixel the same size (crisp).
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  const canvasWidth = Math.round(viewWidth * scale);
  const canvasHeight = Math.round(viewHeight * scale);
  const cssWidth = canvasWidth / dpr;
  const cssHeight = canvasHeight / dpr;
  return {
    scale,
    canvasWidth,
    canvasHeight,
    cssWidth,
    cssHeight,
    offsetX: Math.floor((windowWidth - cssWidth) / 2),
    offsetY: Math.floor((windowHeight - cssHeight) / 2),
  };
}

/** Converts window (client) coordinates to view pixels; may lie outside the view. */
export function screenToView(clientX: number, clientY: number, layout: Layout, viewWidth = 320): { x: number; y: number } {
  const cssPerViewPixel = layout.cssWidth / viewWidth;
  return {
    x: Math.floor((clientX - layout.offsetX) / cssPerViewPixel),
    y: Math.floor((clientY - layout.offsetY) / cssPerViewPixel),
  };
}
