/**
 * World palette: warm late-afternoon Stuttgart. Far colours are hazy and
 * desaturated, mid colours moderate, near/ground colours full strength, so
 * the skater and obstacles always read clearly in front.
 */

/** Sky colour stops, top to horizon, per zone (afternoon -> golden hour); blended into a smooth gradient. */
export const SKY_BANDS: readonly (readonly string[])[] = [
  ['#5f95d0', '#6ea1d7', '#80addd', '#95bbe1', '#abc9e4', '#c3d6e3', '#dbdfda', '#ece2c9'],
  ['#5b8fcc', '#6a9bd2', '#7ea8d7', '#96b6da', '#b0c4da', '#cbcfd3', '#e3d5c2', '#efd6ae'],
  ['#5884c2', '#6791c7', '#7f9ecb', '#9caccc', '#bab6c6', '#d7bfb6', '#ebc6a2', '#f3cb92'],
];

export const CLOUD = { light: '#f7f2e8', mid: '#e7e4e2', shade: '#cdd5df' } as const;

/** Distant hills and landmarks: hazy, low contrast, no outlines. */
export const FAR = {
  hill: '#9db3a1',
  hillShade: '#93aa98',
  forest: '#8aa290',
  forestDark: '#81998a',
  vine: '#a8b99b',
  vineRow: '#98ad8f',
  concrete: '#ccd0d2',
  concreteShade: '#b5bcc2',
  glass: '#97a6b4',
  antennaRed: '#cf9f96',
  wall: '#d3c8b4',
  roof: '#bf9c8f',
  steel: '#adb3b9',
  steelDark: '#9aa2ab',
  white: '#e0e1df',
} as const;

/** Mid-distance city: moderate saturation, no outlines. */
export const MID = {
  sand: '#d8bd8e',
  sandShade: '#c0a476',
  sandLight: '#e6d1a8',
  ochre: '#d3a768',
  ochreShade: '#b98e55',
  plaster: '#ece0c6',
  plasterShade: '#d6c8aa',
  beam: '#8a4a33',
  roof: '#be634b',
  roofShade: '#9f4f3c',
  window: '#6e7e91',
  windowDark: '#58677a',
  stone: '#bcb4a5',
  stoneShade: '#a29a8c',
  green: '#86a670',
  greenShade: '#729660',
  greenDark: '#64875a',
  stair: '#e4d9c1',
  water: '#6a9cb6',
  waterMid: '#5d91ad',
  waterDeep: '#5386a2',
  waterLight: '#a8cbd8',
  waterGlint: '#e2eef0',
  modern: '#b7bfc6',
  modernShade: '#9ea8b2',
  white: '#f1ece0',
  blue: '#5a7fa8',
} as const;

/** Near street details: full strength, darker edges. */
export const NEAR = {
  leaf: '#5d8a3a',
  leafLight: '#78a548',
  leafDark: '#44692c',
  trunk: '#6c4b33',
  trunkDark: '#523825',
  iron: '#3a4047',
  ironLight: '#5c6670',
  glow: '#f6e3a0',
  grass: '#6f9447',
  grassDark: '#5c7e3b',
  gravel: '#9d9486',
  gravelDark: '#867e72',
  sleeper: '#6b5b4b',
  rail: '#d6d3cc',
  railShade: '#7e7b76',
  quay: '#c7b48f',
  quayShade: '#a8956f',
  stone: '#c2b8a6',
  stoneShade: '#9d927f',
  water: '#a6d6ea',
  waterLight: '#e8f6fb',
  flowerRed: '#d4553f',
  flowerYellow: '#f0d05a',
  outline: '#2a2622',
} as const;

/** Stuttgart Stadtbahn (SSB) livery. */
export const TRAIN = {
  yellow: '#f2c230',
  yellowShade: '#d6a41f',
  roof: '#e9e5da',
  window: '#33404f',
  windowLight: '#5d7387',
  skirt: '#8b9097',
  bogie: '#2f3135',
  light: '#fff4c2',
} as const;

/** Riding surface. */
export const GROUND = {
  edge: '#d2ccc1',
  slab: '#b3ada3',
  slabAlt: '#aba59a',
  slabJoint: '#8b857c',
  speck: '#a19b91',
  curbTop: '#ddd7cc',
  curbFace: '#a39d93',
  curbShadow: '#4b4d54',
  asphalt: '#5c5e66',
  asphaltDark: '#53555d',
  asphaltLight: '#686a72',
  marking: '#ddd6c4',
  paver: '#c6b796',
  paverAlt: '#bdae8d',
  paverJoint: '#9a8c6e',
  cobble: '#a99f90',
  cobbleAlt: '#b5ab9b',
  cobbleDark: '#7e7568',
} as const;

/** Page colour around the letterboxed canvas (dark asphalt). */
export const LETTERBOX = '#24262d';
