/**
 * Bitmap pixel font. Every glyph is FONT_LINE_HEIGHT rows tall:
 *   row 0     umlaut dots / accents
 *   rows 1-5  capitals, digits, ascenders (lowercase x-height is rows 2-5)
 *   rows 6-7  descenders (g, j, p, q, y, comma)
 * "#" is a set pixel, "." an empty one. Characters are separated by 1px.
 */
export const FONT_LINE_HEIGHT = 8;
export const FONT_LETTER_SPACING = 1;
/** Baseline row (bottom row of capitals) measured from the top of the line. */
export const FONT_BASELINE = 5;

export interface Glyph {
  readonly width: number;
  /** FONT_LINE_HEIGHT strings of `width` characters. */
  readonly rows: readonly string[];
}

/** Glyph rows starting at row 1; missing rows below are blank. */
const BASE: Record<string, string> = {
  A: '.##./#..#/####/#..#/#..#',
  B: '###./#..#/###./#..#/###.',
  C: '.###/#.../#.../#.../.###',
  D: '###./#..#/#..#/#..#/###.',
  E: '####/#.../###./#.../####',
  F: '####/#.../###./#.../#...',
  G: '.###/#.../#.##/#..#/.###',
  H: '#..#/#..#/####/#..#/#..#',
  I: '###/.#./.#./.#./###',
  J: '..##/...#/...#/#..#/.##.',
  K: '#..#/#.#./##../#.#./#..#',
  L: '#.../#.../#.../#.../####',
  M: '#...#/##.##/#.#.#/#...#/#...#',
  N: '#..#/##.#/#.##/#..#/#..#',
  O: '.##./#..#/#..#/#..#/.##.',
  P: '###./#..#/###./#.../#...',
  Q: '.##./#..#/#..#/#.#./.#.#',
  R: '###./#..#/###./#.#./#..#',
  S: '.###/#.../.##./...#/###.',
  T: '###/.#./.#./.#./.#.',
  U: '#..#/#..#/#..#/#..#/.##.',
  V: '#...#/#...#/.#.#./.#.#./..#..',
  W: '#...#/#...#/#.#.#/##.##/#...#',
  X: '#..#/#..#/.##./#..#/#..#',
  Y: '#.#/#.#/.#./.#./.#.',
  Z: '####/...#/.##./#.../####',
  a: '..../.###/#..#/#..#/.###',
  b: '#.../###./#..#/#..#/###.',
  c: '.../.##/#../#../.##',
  d: '...#/.###/#..#/#..#/.###',
  e: '..../.##./####/#.../.###',
  f: '.##/#../###/#../#..',
  g: '..../.###/#..#/#..#/.###/...#/.##.',
  h: '#.../###./#..#/#..#/#..#',
  i: '#/./#/#/#',
  j: '.#/../.#/.#/.#/.#/#.',
  k: '#../#.#/##./#.#/#.#',
  l: '#/#/#/#/#',
  m: '...../####./#.#.#/#.#.#/#.#.#',
  n: '..../###./#..#/#..#/#..#',
  o: '..../.##./#..#/#..#/.##.',
  p: '..../###./#..#/#..#/###./#.../#...',
  q: '..../.###/#..#/#..#/.###/...#/...#',
  r: '.../#.#/##./#../#..',
  s: '..../.###/##../..##/###.',
  t: '.#./###/.#./.#./..#',
  u: '..../#..#/#..#/#..#/.###',
  v: '.../#.#/#.#/#.#/.#.',
  w: '...../#...#/#.#.#/#.#.#/.#.#.',
  x: '..../#..#/.##./.##./#..#',
  y: '..../#..#/#..#/#..#/.###/...#/.##.',
  z: '..../####/..#./.#../####',
  ß: '.##./#..#/#.#./#..#/#.#.',
  0: '###/#.#/#.#/#.#/###',
  1: '.#./##./.#./.#./###',
  2: '###/..#/###/#../###',
  3: '###/..#/.##/..#/###',
  4: '#.#/#.#/###/..#/..#',
  5: '###/#../###/..#/###',
  6: '###/#../###/#.#/###',
  7: '###/..#/.#./.#./.#.',
  8: '###/#.#/###/#.#/###',
  9: '###/#.#/###/..#/###',
  '.': '././././#',
  ',': '../../../../.#/#.',
  ':': './#/././#',
  ';': '../.#/../../.#/#.',
  '!': '#/#/#/./#',
  '?': '###/..#/.##/.../.#.',
  '-': '.../.../###/.../...',
  '+': '.../.#./###/.#./...',
  '/': '..#/..#/.#./#../#..',
  '(': '.#/#./#./#./.#',
  ')': '#./.#/.#/.#/#.',
  "'": '#/#/./././.',
  '"': '#.#/#.#/.../.../...',
  '%': '#.#/..#/.#./#../#.#',
  '*': '.../#.#/.#./#.#/...',
  '=': '.../###/.../###/...',
  '<': '..#/.#./#../.#./..#',
  '>': '#../.#./..#/.#./#..',
  '#': '.#.#./#####/.#.#./#####/.#.#.',
  '&': '.#../#.#./.#../#.#./.#.#',
  _: '.../.../.../.../.../###',
  ' ': '../../../../..',
};

/** Capital umlauts squeeze the letter to 4 rows so the dots stay separate. Rows start at row 0. */
const FULL: Record<string, string> = {
  Ä: '#..#/..../.##./#..#/####/#..#',
  Ö: '#..#/..../.##./#..#/#..#/.##.',
  Ü: '#..#/..../#..#/#..#/#..#/.##.',
};

/** Lowercase umlauts: base letter with dots in row 0 above its outer columns. */
const DOTTED: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u' };

const ALIASES: Record<string, string> = { ẞ: 'ß', '–': '-', '—': '-', '„': '"', '“': '"', '’': "'", '×': 'x' };

function normalise(rows: string[]): Glyph {
  const width = Math.max(...rows.map((r) => r.length));
  const padded = Array.from({ length: FONT_LINE_HEIGHT }, (_, i) => (rows[i] ?? '').padEnd(width, '.'));
  return { width, rows: padded };
}

function buildGlyphs(): Map<string, Glyph> {
  const glyphs = new Map<string, Glyph>();
  for (const [ch, art] of Object.entries(BASE)) glyphs.set(ch, normalise(['', ...art.split('/')]));
  for (const [ch, art] of Object.entries(FULL)) glyphs.set(ch, normalise(art.split('/')));
  for (const [ch, base] of Object.entries(DOTTED)) {
    const g = glyphs.get(base)!;
    const dots = '#'.padEnd(g.width - 1, '.') + '#';
    glyphs.set(ch, { width: g.width, rows: [dots, ...g.rows.slice(1)] });
  }
  for (const [alias, target] of Object.entries(ALIASES)) glyphs.set(alias, glyphs.get(target)!);
  return glyphs;
}

const GLYPHS = buildGlyphs();

/** The glyph for a character; unknown characters render as "?". */
export function glyphFor(ch: string): Glyph | null {
  return GLYPHS.get(ch) ?? GLYPHS.get('?') ?? null;
}

/** Width in view pixels of the widest line of `text` at the given integer scale. */
export function measureText(text: string, scale = 1): number {
  let widest = 0;
  for (const line of text.split('\n')) {
    let w = 0;
    for (const ch of line) w += glyphFor(ch)!.width + FONT_LETTER_SPACING;
    widest = Math.max(widest, w > 0 ? w - FONT_LETTER_SPACING : 0);
  }
  return widest * scale;
}
