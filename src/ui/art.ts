/**
 * UI palette and pixel icons (palette sprites, rasterised once on first draw).
 */
import { sprite } from '../core/sprite';

export const UI = {
  ink: '#1b1f2e',
  white: '#fff4e0',
  muted: '#b9c0d8',
  yellow: '#ffd23f',
  orange: '#ff8c42',
  red: '#e84855',
  teal: '#3fc1c9',
  empty: '#4a4a5c',
  dim: 'rgba(16, 18, 30, 0.62)',
  panel: 'rgba(16, 18, 30, 0.55)',
} as const;

export const STAR = sprite({ y: UI.yellow, o: UI.orange, k: UI.ink }, [`
  ...k...
  ..kyk..
  kkkyykk
  kyyyyok
  .kyyok.
  .kyoyk.
  .kk.kk.
`]);

/** Frame 0 full, frame 1 empty. */
export const HEART = sprite({ r: UI.red, w: UI.white, d: UI.empty, k: UI.ink }, [
  `
  .kk.kk.
  krwkrrk
  krrrrrk
  .krrrk.
  ..krk..
  ...k...
`,
  `
  .kk.kk.
  kddkddk
  kdddddk
  .kdddk.
  ..kdk..
  ...k...
`,
]);

/** Rounded 14x14 button plate drawn behind every icon. */
export const BUTTON = sprite({ b: 'rgba(16, 18, 30, 0.55)', e: 'rgba(255, 244, 224, 0.45)' }, [`
  ..eeeeeeeeee..
  .ebbbbbbbbbbe.
  ebbbbbbbbbbbbe
  ebbbbbbbbbbbbe
  ebbbbbbbbbbbbe
  ebbbbbbbbbbbbe
  ebbbbbbbbbbbbe
  ebbbbbbbbbbbbe
  ebbbbbbbbbbbbe
  ebbbbbbbbbbbbe
  ebbbbbbbbbbbbe
  ebbbbbbbbbbbbe
  .ebbbbbbbbbbe.
  ..eeeeeeeeee..
`]);

const ICON = { w: UI.white, r: UI.red };

/** 8x8 icons centred on the button plate (offset 3,3). */
export const ICON_PAUSE = sprite(ICON, [`
  ........
  .ww..ww.
  .ww..ww.
  .ww..ww.
  .ww..ww.
  .ww..ww.
  .ww..ww.
  ........
`]);

export const ICON_PLAY = sprite(ICON, [`
  ........
  .w......
  .www....
  .wwwww..
  .wwwww..
  .www....
  .w......
  ........
`]);

/** Frame 0 sound on, frame 1 muted. */
export const ICON_SOUND = sprite(ICON, [
  `
  ........
  ...w..w.
  ..ww...w
  www..w.w
  www..w.w
  ..ww...w
  ...w..w.
  ........
`,
  `
  ........
  ...w....
  ..ww.r.r
  www...r.
  www..r.r
  ..ww....
  ...w....
  ........
`,
]);

/** Frame 0 enter fullscreen, frame 1 leave it. */
export const ICON_FULLSCREEN = sprite(ICON, [
  `
  ww....ww
  w......w
  ........
  ........
  ........
  ........
  w......w
  ww....ww
`,
  `
  .w....w.
  ww....ww
  ........
  ........
  ........
  ........
  ww....ww
  .w....w.
`,
]);

/** Phone turning to landscape, for the portrait hint. */
export const ROTATE = sprite({ w: UI.white, s: UI.teal, y: UI.yellow }, [`
  .wwwwwwww...........
  .wssssssw...........
  .wssssssw...........
  .wssssssw....yy.....
  .wssssssw......y....
  .wssssssw.......y...
  .wssssssw.......y...
  .wssssssw.....y.y.y.
  .wssssssw......yyy..
  .wssssssw.......y...
  .wssssssw...........
  .wssssssw...........
  .wwwwwwww...........
  .www..www...........
  .wwwwwwww...........
`]);
