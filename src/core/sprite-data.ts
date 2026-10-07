/** Maps a sprite character to a CSS colour. "." and " " are always transparent. */
export type Palette = Readonly<Record<string, string>>;

export interface SpriteData {
  readonly width: number;
  readonly height: number;
  /** Row-major colours, null = transparent. */
  readonly pixels: readonly (string | null)[];
}

const TRANSPARENT = new Set(['.', ' ']);

export function parseSprite(rows: readonly string[], palette: Palette): SpriteData {
  const width = rows[0]?.length ?? 0;
  const pixels: (string | null)[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Sprite row ${y} has length ${row.length}, expected ${width}: "${row}"`);
    }
    for (const ch of row) {
      if (TRANSPARENT.has(ch)) {
        pixels.push(null);
        continue;
      }
      const color = palette[ch];
      if (color === undefined) throw new Error(`Sprite character "${ch}" in row ${y} is not in the palette`);
      pixels.push(color);
    }
  });
  return { width, height: rows.length, pixels };
}

/** Turns an indented template literal into rows (blank lines dropped, each line trimmed). */
export function rowsFromString(art: string): string[] {
  return art
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
