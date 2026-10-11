/**
 * Allowed values for the anonymous play statistics (`POST /event`, `GET /stats`).
 * Mirror of src/net/telemetry-types.ts in the game; a game test keeps both equal.
 */

export const EVENT_KINDS = ['session', 'run', 'end'] as const;
export const INPUTS = ['touch', 'keys'] as const;
export const ORIENTATIONS = ['landscape', 'portrait'] as const;
export const PLATFORMS = ['android', 'ios', 'other'] as const;
/** Lower bounds of the score buckets. */
export const SCORE_BUCKETS = [0, 100, 500, 2000, 5000] as const;
export const DISTANCE_STEP_M = 100;
export const MAX_DISTANCE_M = 5000;
export const RUN_SECONDS_STEP = 10;
export const MAX_RUN_SECONDS = 3600;
export const MAX_END_SECONDS = 4 * 3600;
export const MAX_EVENT_BYTES = 1024;
export const STATS_RANGES = [7, 30, 90] as const;
/** Country, region or city groups with fewer sessions in the range are reported as 'other'. */
export const MIN_GROUP_SESSIONS = 5;
export const VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d{1,2}$/;
export const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/;
