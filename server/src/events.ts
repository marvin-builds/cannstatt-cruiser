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
/** Raw events are deleted after this many days; older days live on as daily summaries (ROADMAP 48). */
export const RAW_RETENTION_DAYS = 90;
/** The range value meaning "Alles": every day since the first recorded one. */
export const ALL_RANGE = 0;
/** The board's ranges in days; ALL_RANGE is everything. Ranges beyond RAW_RETENTION_DAYS come from the summaries. */
export const STATS_RANGES = [7, 30, 90, 365, ALL_RANGE] as const;
/** Country, region or city groups need this many sessions in the range (every place counts); unknown places are 'other'. */
export const MIN_GROUP_SESSIONS = 1;
export const VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d{1,2}$/;
/** `GET /stats?…&testers=1` includes test devices (ROADMAP 55). */
export const STATS_TESTERS_PARAM = 'testers';
export const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/;
