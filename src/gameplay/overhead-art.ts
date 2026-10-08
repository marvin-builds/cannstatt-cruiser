/**
 * Art of the overhead obstacles (catalogue `elevation > 0`): the hanging part
 * is the sprite (catalogue w x h), the supports that carry it (posts, a pole)
 * are drawn from it down to the ground behind the rider and never collide.
 */
import { GROUND_Y } from '../core/config';
import { type Sprite, sprite } from '../core/sprite';
import type { Entity } from '../types';

const K = '#1a1418';

/** Rows of a `w` x `h` box with an outline and diagonal stripes of `a` / `b`, `band` px wide. */
function stripedBox(w: number, h: number, a: string, b: string, band: number): string[] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return 'k';
      return Math.floor((x + y) / band) % 2 === 0 ? a : b;
    }).join(''),
  );
}

/** Pastes `part` into `rows` with its top-left at (x, y); '.' is transparent. */
function paste(rows: string[], part: readonly string[], x: number, y: number): void {
  part.forEach((line, dy) => {
    const row = [...rows[y + dy]!];
    [...line].forEach((ch, dx) => {
      if (ch !== '.') row[x + dx] = ch;
    });
    rows[y + dy] = row.join('');
  });
}

function canvasOf(w: number, h: number): string[] {
  return Array.from({ length: h }, () => '.'.repeat(w));
}

function bar(w: number): string[] {
  return ['k'.repeat(w), `k${'M'.repeat(w - 2)}k`, `k${'m'.repeat(w - 2)}k`, 'k'.repeat(w)];
}

function rod(x: number, from: number, to: number, rows: string[]): void {
  for (let y = from; y < to; y++) paste(rows, ['k'], x, y);
}

// ---------------------------------------------------------------- banner

/** Zeichen 123 "Arbeitsstelle": red triangle, white field, black worker. */
const WARNING_TRIANGLE = [
  '.......k.......',
  '......krk......',
  '.....krwrk.....',
  '.....krwrk.....',
  '....krwkwrk....',
  '....krwkwrk....',
  '...krwkkkwrk...',
  '...krwwkwwrk...',
  '..krwwkwkwwrk..',
  '..krwkwwwkwrk..',
  '.krwwwwwwwwwrk.',
  '.krrrrrrrrrrrk.',
  '.kkkkkkkkkkkkk.',
];

function bannerArt(): string[] {
  const rows = canvasOf(30, 41);
  paste(rows, bar(30), 0, 0);
  rod(10, 4, 6, rows);
  rod(18, 4, 6, rows);
  paste(rows, WARNING_TRIANGLE, 7, 5);
  rod(6, 4, 21, rows);
  rod(23, 4, 21, rows);
  paste(rows, stripedBox(24, 20, 'r', 'w', 3), 3, 21);
  return rows;
}

const BANNER = sprite({ k: K, M: '#c3c9d1', m: '#7d8592', r: '#d8342c', w: '#f4f1ea' }, [bannerArt()]);

// ---------------------------------------------------------------- stop sign

/** Stadtbahn stop: green H on a yellow disc. */
const H_DISC = [
  '....kkkkk....',
  '..kkyyyyykk..',
  '.kyyyyyyyyyk.',
  '.kyggyyyggyk.',
  'kyyggyyyggyyk',
  'kyyggyyyggyyk',
  'kyygggggggyyk',
  'kyyggyyyggyyk',
  'kyyggyyyggyyk',
  '.kyggyyyggyk.',
  '.kyyyyyyyyyk.',
  '..kkyyyyykk..',
  '....kkkkk....',
];

/** Timetable board under the disc: green frame (g), name strip and timetable lines. */
function timetable(w: number, h: number): string[] {
  return Array.from({ length: h }, (_, y) => {
    if (y === 0 || y === h - 1) return 'k'.repeat(w);
    if (y === 1 || y === 4 || y === h - 2) return `k${'g'.repeat(w - 2)}k`;
    if (y === 2 || y === 3) return `kg${y === 2 ? 'w'.repeat(w - 4) : `w${'d'.repeat(w - 6)}w`}gk`;
    const line = y % 2 === 0 ? `w${'l'.repeat(w - 8)}www` : 'w'.repeat(w - 4);
    return `kg${line}gk`;
  });
}

function stopSignArt(): string[] {
  const rows = canvasOf(22, 41);
  paste(rows, bar(22), 0, 0);
  rod(6, 4, 6, rows);
  rod(10, 4, 6, rows);
  paste(rows, H_DISC, 2, 5);
  rod(5, 18, 20, rows);
  rod(11, 18, 20, rows);
  paste(rows, timetable(15, 21), 1, 20);
  return rows;
}

const STOP_SIGN = sprite(
  { k: K, M: '#c3c9d1', m: '#7d8592', y: '#ffd21f', g: '#1f8a4c', w: '#f4f1ea', d: '#1a1418', l: '#7d8592' },
  [stopSignArt()],
);

// ---------------------------------------------------------------- supports

interface Support {
  /** Post x offsets from the sprite's left edge. */
  xs: number[];
  /** Post slices (1 row each); the frame alternates every `band` rows. */
  post: Sprite;
  band: number;
  foot: Sprite;
  /** Sprite row where the posts start (below the crossbar's top). */
  from: number;
}

const BARRIER_POST = sprite({ k: K, r: '#d8342c', w: '#f4f1ea' }, [['krk'], ['kwk']]);
const RUBBER_FOOT = sprite({ k: K, f: '#2c2c30' }, [['.kkkkk.', 'kfffffk', 'kkkkkkk']]);
const POLE = sprite({ k: K, M: '#c3c9d1', m: '#7d8592' }, [['kMmk']]);
const CONCRETE_FOOT = sprite({ k: K, c: '#b4afa4', d: '#8a857b' }, [['.kkkkkk.', 'kcccccdk', 'kkkkkkkk']]);

type OverheadKind = 'banner' | 'stopSign';

const ART: Record<OverheadKind, { sprite: Sprite; support: Support }> = {
  banner: { sprite: BANNER, support: { xs: [0, 27], post: BARRIER_POST, band: 4, foot: RUBBER_FOOT, from: 3 } },
  stopSign: { sprite: STOP_SIGN, support: { xs: [18], post: POLE, band: 1, foot: CONCRETE_FOOT, from: 3 } },
};

export function isOverheadArt(kind: string): kind is OverheadKind {
  return kind in ART;
}

export function overheadSize(kind: OverheadKind): { w: number; h: number } {
  const s = ART[kind].sprite;
  return { w: s.width, h: s.height };
}

/** Supports first (behind), then the hanging sprite, at integer coordinates (`lead`: RenderContext.scrollLead). */
export function drawOverhead(g: CanvasRenderingContext2D, e: Entity, kind: OverheadKind, lead = 0): void {
  const { sprite: art, support } = ART[kind];
  const x = Math.round(e.x - lead);
  const y = Math.round(e.y);
  const { post, foot, band } = support;
  const footTop = GROUND_Y - foot.height;
  for (const dx of support.xs) {
    const px = x + dx;
    for (let py = y + support.from; py < footTop; py++) post.draw(g, Math.floor((py - y) / band) % post.frameCount, px, py);
    foot.draw(g, 0, px - Math.floor((foot.width - post.width) / 2), footTop);
  }
  art.draw(g, 0, x, y);
}
