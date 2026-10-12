/**
 * Strict parsing of a `POST /event` body against the allow-lists in events.ts:
 * exactly the fields of its kind (no extra, none missing; optional ones may be
 * left out), allowed values only. A session's `orientation` from builds before
 * ROADMAP 69 is still accepted (valid values only) but dropped from the event.
 */
import {
  DISTANCE_STEP_M, INPUTS, MAX_DISTANCE_M, MAX_END_SECONDS, MAX_RUN_SECONDS, ORIENTATIONS, PLATFORMS, RUN_SECONDS_STEP,
  SCORE_BUCKETS, SESSION_ID_PATTERN, VERSION_PATTERN,
} from './events';
import type { TelemetryEvent } from './insights-types';

const FIELDS: Record<TelemetryEvent['kind'], readonly string[]> = {
  session: ['kind', 'session', 'version', 'input', 'platform', 'kid'],
  run: ['kind', 'session', 'seconds', 'score', 'distance', 'kid'],
  end: ['kind', 'session', 'seconds'],
};
/** Fields a kind may leave out: sent only by newer builds (ROADMAP 55) or only by older ones (`orientation`, ROADMAP 69). */
const OPTIONAL_FIELDS: Record<TelemetryEvent['kind'], readonly string[]> = { session: ['tester', 'returning', 'orientation'], run: [], end: [] };

const oneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

/** Whether `value` is an integer multiple of `step` within 0..max. */
const isStep = (value: unknown, step: number, max: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max && (value as number) % step === 0;

/** Every required field and no other than the optional ones. */
function hasFieldsOf(body: Record<string, unknown>, kind: TelemetryEvent['kind']): boolean {
  const allowed = [...FIELDS[kind], ...OPTIONAL_FIELDS[kind]];
  return FIELDS[kind].every((field) => Object.hasOwn(body, field)) && Object.keys(body).every((key) => allowed.includes(key));
}

const isOptionalBoolean = (value: unknown): boolean => value === undefined || typeof value === 'boolean';

/** The event, or null when the text is not a valid event. */
export function parseEvent(text: string): TelemetryEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const kind = record.kind;
  if (!oneOf(Object.keys(FIELDS), kind) || !hasFieldsOf(record, kind as TelemetryEvent['kind'])) return null;
  if (typeof record.session !== 'string' || !SESSION_ID_PATTERN.test(record.session)) return null;
  const event = record as unknown as TelemetryEvent;
  switch (event.kind) {
    case 'session': {
      const { orientation, ...session } = record;
      return typeof event.version === 'string' && VERSION_PATTERN.test(event.version) && oneOf(INPUTS, event.input) &&
        (orientation === undefined || oneOf(ORIENTATIONS, orientation)) && oneOf(PLATFORMS, event.platform) &&
        typeof event.kid === 'boolean' && isOptionalBoolean(event.tester) && isOptionalBoolean(event.returning)
        ? (session as unknown as TelemetryEvent)
        : null;
    }
    case 'run':
      return isStep(event.seconds, RUN_SECONDS_STEP, MAX_RUN_SECONDS) && oneOf(SCORE_BUCKETS, event.score) &&
        isStep(event.distance, DISTANCE_STEP_M, MAX_DISTANCE_M) && typeof event.kid === 'boolean'
        ? event
        : null;
    case 'end':
      return isStep(event.seconds, 1, MAX_END_SECONDS) ? event : null;
  }
}
