import type { LayerSpec } from '../scene';
import { CLOUDS } from './sky';

/** Parallax speeds as fractions of the ground speed, back to front. */
export const CLOUD_FACTOR = 0.04;
export const FAR_FACTOR = 0.1;
export const MID_FACTOR = 0.3;
export const NEAR_FACTOR = 0.6;

/** Y of the near-layer Stadtbahn rail (wheel line). */
export const TRAIN_RAIL_Y = 146;

/** Drifting clouds, shared by every zone. */
export const CLOUD_LAYER: LayerSpec = {
  factor: CLOUD_FACTOR,
  drift: 3,
  props: {
    catalogue: CLOUDS,
    stream: { intro: [], landmarks: [], fillers: Object.keys(CLOUDS), gap: [40, 150], fillersBetween: [0, 0] },
    startAt: -30,
  },
};
