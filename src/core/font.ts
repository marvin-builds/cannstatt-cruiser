import { FONT_LETTER_SPACING, FONT_LINE_HEIGHT, type Glyph, glyphFor, lineEnd, measureLine, measureText } from './font-data';

export { FONT_LINE_HEIGHT, measureText };

export interface TextOptions {
  color?: string;
  /** Integer pixel scale (2 = each font pixel is 2x2 view pixels). */
  scale?: number;
  /** Where `x` is: left edge, centre, or right edge of each line. */
  align?: 'left' | 'center' | 'right';
  /** Colour of a 1-pixel drop shadow (down-right), drawn underneath. */
  shadow?: string;
}

const NO_OPTIONS: TextOptions = {};

/**
 * Draws text with the bitmap font. `y` is the top of the line (umlaut row);
 * capitals start one font pixel lower. "\n" starts a new line. Each glyph is
 * a cached canvas per colour (one drawImage per character, no allocation per
 * call once cached).
 */
export function drawText(g: CanvasRenderingContext2D, text: string, x: number, y: number, options = NO_OPTIONS): void {
  const { color = '#ffffff', scale = 1, align = 'left', shadow } = options;
  g.imageSmoothingEnabled = false;
  if (shadow) drawLines(g, text, x + scale, y + scale, shadow, scale, align);
  drawLines(g, text, x, y, color, scale, align);
}

function drawLines(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale: number,
  align: 'left' | 'center' | 'right',
): void {
  const glyphs = glyphCanvases(color);
  for (let start = 0, line = 0; start <= text.length; line++) {
    const end = lineEnd(text, start);
    const width = measureLine(text, start, end) * scale;
    let cx = Math.round(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x);
    const cy = Math.round(y + line * (FONT_LINE_HEIGHT + 1) * scale);
    for (let i = start; i < end; i++) {
      const glyph = glyphFor(text[i]!)!;
      g.drawImage(glyphCanvas(glyphs, glyph, color), cx, cy, glyph.width * scale, FONT_LINE_HEIGHT * scale);
      cx += (glyph.width + FONT_LETTER_SPACING) * scale;
    }
    start = end + 1;
  }
}

/** Colours cached at most; a game uses a handful, so more means colours are generated per frame. */
const MAX_CACHED_COLOURS = 32;
const glyphCache = new Map<string, Map<Glyph, HTMLCanvasElement>>();

function glyphCanvases(color: string): Map<Glyph, HTMLCanvasElement> {
  let glyphs = glyphCache.get(color);
  if (!glyphs) {
    if (glyphCache.size >= MAX_CACHED_COLOURS) glyphCache.clear();
    glyphs = new Map();
    glyphCache.set(color, glyphs);
  }
  return glyphs;
}

function glyphCanvas(glyphs: Map<Glyph, HTMLCanvasElement>, glyph: Glyph, color: string): HTMLCanvasElement {
  let canvas = glyphs.get(glyph);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, glyph.width);
    canvas.height = FONT_LINE_HEIGHT;
    const c = canvas.getContext('2d')!;
    c.fillStyle = color;
    glyph.rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') c.fillRect(rx, ry, 1, 1);
    });
    glyphs.set(glyph, canvas);
  }
  return canvas;
}
