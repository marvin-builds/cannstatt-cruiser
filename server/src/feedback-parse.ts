/**
 * Strict parsing of a `POST /feedback` body: exactly the FeedbackBody fields
 * (the secret key and the tester pass optional), allow-listed values, the text normalised and checked for length and control
 * characters, and a log only on a bug report.
 */
import { INPUTS, ORIENTATIONS, PLATFORMS, SESSION_ID_PATTERN, VERSION_PATTERN } from './events';
import {
  FEEDBACK_KEY_PATTERN, FEEDBACK_KINDS, MAX_FEEDBACK_TEXT, MAX_LOG_LINE_CHARS, MAX_LOG_LINES, MAX_TESTER_PASS_CHARS, MAX_VIEW_WIDTH, MIN_FEEDBACK_TEXT,
  MIN_VIEW_WIDTH,
} from './feedback-rules';
import type { FeedbackBody, ReceivedFeedback } from './feedback-types';

const FIELDS: readonly (keyof ReceivedFeedback)[] = ['session', 'kind', 'text', 'version', 'platform', 'input', 'orientation', 'viewWidth', 'log'];
/** The key is sent by games since ROADMAP 70, the tester pass only from test devices (ROADMAP 75). */
const OPTIONAL: readonly (keyof FeedbackBody)[] = ['key', 'testerPass'];
/** Control characters (C0, DEL, C1); newline is allowed in the text only. */
const CONTROL = /\p{Cc}/u;
const CONTROL_EXCEPT_NEWLINE = /(?!\n)\p{Cc}/u;

const oneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

/** Line breaks as `\n`, trimmed, and runs of more than two blank lines cut to two. */
export function normaliseFeedbackText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim().replace(/\n{4,}/g, '\n\n\n');
}

const isLogLine = (line: unknown): line is string =>
  typeof line === 'string' && line.length <= MAX_LOG_LINE_CHARS && !CONTROL.test(line);

const isLog = (log: unknown): log is string[] => Array.isArray(log) && log.length <= MAX_LOG_LINES && log.every(isLogLine);

const isViewWidth = (width: unknown): width is number =>
  Number.isSafeInteger(width) && (width as number) >= MIN_VIEW_WIDTH && (width as number) <= MAX_VIEW_WIDTH;

/** The body with its text normalised, or null when the JSON text is not valid feedback. */
export function parseFeedback(json: string): ReceivedFeedback | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const body = parsed as Record<string, unknown>;
  const optional = OPTIONAL.filter((field) => Object.hasOwn(body, field)).length;
  if (Object.keys(body).length !== FIELDS.length + optional || !FIELDS.every((field) => Object.hasOwn(body, field))) return null;
  if (Object.hasOwn(body, 'key') && !(typeof body.key === 'string' && FEEDBACK_KEY_PATTERN.test(body.key))) return null;
  // Only its type and length are checked here; an invalid pass is ignored later, so an old pass never blocks feedback.
  if (Object.hasOwn(body, 'testerPass') && !(typeof body.testerPass === 'string' && body.testerPass.length <= MAX_TESTER_PASS_CHARS)) return null;
  if (typeof body.text !== 'string' || CONTROL_EXCEPT_NEWLINE.test(body.text.replace(/\r\n?/g, '\n'))) return null;
  const text = normaliseFeedbackText(body.text);
  const valid =
    typeof body.session === 'string' && SESSION_ID_PATTERN.test(body.session) &&
    oneOf(FEEDBACK_KINDS, body.kind) &&
    text.length >= MIN_FEEDBACK_TEXT && text.length <= MAX_FEEDBACK_TEXT &&
    typeof body.version === 'string' && VERSION_PATTERN.test(body.version) &&
    oneOf(PLATFORMS, body.platform) && oneOf(INPUTS, body.input) && oneOf(ORIENTATIONS, body.orientation) &&
    isViewWidth(body.viewWidth) &&
    isLog(body.log) && (body.kind === 'bug' || body.log.length === 0);
  return valid ? ({ ...body, text } as unknown as ReceivedFeedback) : null;
}
