import { FONT_LETTER_SPACING, FONT_LINE_HEIGHT, glyphFor, measureText } from './font-data';

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

/**
 * Draws text with the bitmap font. `y` is the top of the line (umlaut row);
 * capitals start one font pixel lower. "\n" starts a new line.
 */
export function drawText(g: CanvasRenderingContext2D, text: string, x: number, y: number, options: TextOptions = {}): void {
  const { color = '#ffffff', scale = 1, align = 'left', shadow } = options;
  if (shadow) drawText(g, text, x + scale, y + scale, { scale, align, color: shadow });
  g.fillStyle = color;
  text.split('\n').forEach((line, lineIndex) => {
    const width = measureText(line, scale);
    let cx = Math.round(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x);
    const cy = Math.round(y + lineIndex * (FONT_LINE_HEIGHT + 1) * scale);
    for (const ch of line) {
      const glyph = glyphFor(ch)!;
      glyph.rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] === '#') g.fillRect(cx + rx * scale, cy + ry * scale, scale, scale);
        }
      });
      cx += (glyph.width + FONT_LETTER_SPACING) * scale;
    }
  });
}
