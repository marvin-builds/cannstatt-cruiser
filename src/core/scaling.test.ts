import { describe, expect, it } from 'vitest';
import { computeLayout, screenToView, type ViewBounds } from './scaling';

const BOUNDS: ViewBounds = { minWidth: 320, maxWidth: 427, height: 180 };

describe('computeLayout', () => {
  it('fills a 16:9 desktop window exactly at the design width', () => {
    const l = computeLayout(1280, 720, 1, BOUNDS);
    expect(l.scale).toBe(4);
    expect(l.viewWidth).toBe(320);
    expect(l.viewHeight).toBe(180);
    expect(l.cssWidth).toBe(1280);
    expect(l.cssHeight).toBe(720);
    expect(l.offsetX).toBe(0);
    expect(l.offsetY).toBe(0);
  });

  it('widens the view on a wide phone so only a tiny margin stays', () => {
    const l = computeLayout(2532, 1170, 1, BOUNDS);
    expect(l.scale).toBe(6);
    expect(l.viewWidth).toBe(422);
    expect(l.canvasWidth).toBe(2532);
    expect(l.canvasHeight).toBe(1080);
  });

  it('scales in device pixels so high-DPR screens stay crisp', () => {
    const l = computeLayout(844, 390, 3, BOUNDS);
    expect(l.scale).toBe(6);
    expect(l.viewWidth).toBe(422);
    expect(l.canvasWidth).toBe(2532);
    expect(l.canvasHeight).toBe(1080);
    expect(l.cssWidth).toBeCloseTo(844, 5);
    expect(l.cssHeight).toBeCloseTo(360, 5);
    expect(l.offsetX).toBe(0);
    expect(l.offsetY).toBe(15);
  });

  it('clamps ultra-wide screens at the maximum width and letterboxes the rest', () => {
    const l = computeLayout(3440, 1440, 1, BOUNDS);
    expect(l.scale).toBe(8);
    expect(l.viewWidth).toBe(427);
    expect(l.canvasWidth).toBe(3416);
    expect(l.offsetX).toBe(12);
  });

  it('widens the view when the width limits the scale but leaves spare width (laptop 16:10)', () => {
    const l = computeLayout(1440, 900, 1, BOUNDS);
    expect(l.scale).toBe(4);
    expect(l.viewWidth).toBe(360);
    expect(l.cssWidth).toBe(1440);
    expect(l.offsetX).toBe(0);
    expect(l.offsetY).toBe(90);
  });

  it('widens the view on a high-DPR laptop', () => {
    const l = computeLayout(1512, 982, 2, BOUNDS);
    expect(l.scale).toBe(9);
    expect(l.viewWidth).toBe(336);
    expect(l.canvasWidth).toBe(3024);
    expect(l.offsetX).toBe(0);
  });

  it('uses the spare width of a 10:7 window, too', () => {
    const l = computeLayout(1000, 700, 1, BOUNDS);
    expect(l.scale).toBe(3);
    expect(l.viewWidth).toBe(333);
    expect(l.cssWidth).toBe(999);
    expect(l.cssHeight).toBe(540);
    expect(l.offsetX).toBe(0);
    expect(l.offsetY).toBe(80);
  });

  it('never goes below the design width when the screen is exactly that wide', () => {
    const l = computeLayout(960, 900, 1, BOUNDS);
    expect(l.scale).toBe(3);
    expect(l.viewWidth).toBe(320);
  });

  it('fills the width in portrait as well (the portrait hint uses the whole width)', () => {
    const l = computeLayout(390, 844, 3, BOUNDS);
    expect(l.scale).toBe(3);
    expect(l.viewWidth).toBe(390);
    expect(l.canvasWidth).toBe(1170);
  });

  it('falls back to a fractional downscale at the design width when the window is tiny', () => {
    const l = computeLayout(160, 90, 1, BOUNDS);
    expect(l.scale).toBeCloseTo(0.5, 5);
    expect(l.viewWidth).toBe(320);
    expect(l.cssWidth).toBeCloseTo(160, 5);
  });
});

describe('screenToView', () => {
  it('maps client coordinates into view pixels', () => {
    const l = computeLayout(1000, 700, 1, BOUNDS);
    expect(screenToView(0, 80, l)).toEqual({ x: 0, y: 0 });
    expect(screenToView(480, 80 + 270, l)).toEqual({ x: 160, y: 90 });
    expect(screenToView(998, 80, l)).toEqual({ x: 332, y: 0 });
  });

  it('maps the right edge of a widened view on a high-DPR phone', () => {
    const l = computeLayout(844, 390, 3, BOUNDS);
    expect(screenToView(843.9, 15, l)).toEqual({ x: 421, y: 0 });
    expect(screenToView(422, 195, l)).toEqual({ x: 211, y: 90 });
  });
});
