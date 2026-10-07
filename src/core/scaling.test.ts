import { describe, expect, it } from 'vitest';
import { computeLayout, screenToView } from './scaling';

describe('computeLayout', () => {
  it('uses the largest integer scale that fits and centres the image', () => {
    const l = computeLayout(1280, 720, 1, 320, 180);
    expect(l.scale).toBe(4);
    expect(l.cssWidth).toBe(1280);
    expect(l.cssHeight).toBe(720);
    expect(l.offsetX).toBe(0);
    expect(l.offsetY).toBe(0);
  });

  it('letterboxes when the window aspect differs', () => {
    const l = computeLayout(1000, 700, 1, 320, 180);
    expect(l.scale).toBe(3);
    expect(l.cssWidth).toBe(960);
    expect(l.cssHeight).toBe(540);
    expect(l.offsetX).toBe(20);
    expect(l.offsetY).toBe(80);
  });

  it('scales in device pixels so high-DPR screens stay crisp', () => {
    const l = computeLayout(844, 390, 3, 320, 180);
    expect(l.scale).toBe(6);
    expect(l.canvasWidth).toBe(1920);
    expect(l.canvasHeight).toBe(1080);
    expect(l.cssWidth).toBeCloseTo(640, 5);
    expect(l.cssHeight).toBeCloseTo(360, 5);
  });

  it('falls back to a fractional downscale when the window is tiny', () => {
    const l = computeLayout(160, 90, 1, 320, 180);
    expect(l.scale).toBeCloseTo(0.5, 5);
    expect(l.cssWidth).toBeCloseTo(160, 5);
  });
});

describe('screenToView', () => {
  it('maps client coordinates into view pixels', () => {
    const l = computeLayout(1000, 700, 1, 320, 180);
    expect(screenToView(20, 80, l)).toEqual({ x: 0, y: 0 });
    expect(screenToView(20 + 480, 80 + 270, l)).toEqual({ x: 160, y: 90 });
  });
});
