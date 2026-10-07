import { PLAYER_X } from '../../core/config';
import type { LayerSpec } from '../scene';
import type { Depth } from '../zones';
import { CLOUDS } from './sky';

/** Parallax speeds as fractions of the ground speed, back to front. */
export const CLOUD_FACTOR = 0.04;
export const FAR_FACTOR = 0.1;
export const MID_FACTOR = 0.3;
export const NEAR_FACTOR = 0.6;

/**
 * Where each depth's zone seam sits on screen when the gateway reaches the
 * player (ground and near layer right under the skater). Mid and far seams
 * trail behind, so the next zone streams in near first and far last.
 */
export const GROUND_DEPTH: Depth = { factor: 1, seamAt: PLAYER_X };
export const NEAR_DEPTH: Depth = { factor: NEAR_FACTOR, seamAt: PLAYER_X };
export const MID_DEPTH: Depth = { factor: MID_FACTOR, seamAt: 250 };
export const FAR_DEPTH: Depth = { factor: FAR_FACTOR, seamAt: 372 };

/** Y of the near-layer Stadtbahn rail (wheel line). */
export const TRAIN_RAIL_Y = 146;

/** Cloud drift in layer px per second. */
export const CLOUD_DRIFT = 3;

/** Drifting clouds, shared by every zone (they never change at a seam). */
export const CLOUD_PROPS: NonNullable<LayerSpec['props']> = {
  catalogue: CLOUDS,
  stream: { intro: [], landmarks: [], fillers: Object.keys(CLOUDS), gap: [40, 150], fillersBetween: [0, 0] },
  startAt: -30,
};
