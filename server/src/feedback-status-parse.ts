/**
 * Strict parsing of the bodies the game sends with a report's key: `POST /feedback/status` (ROADMAP 70), exactly
 * {items: [{id, key}, ...]} with 1..MAX_STATUS_ITEMS items, and `POST /feedback/delete` (ROADMAP 78), exactly {id, key}.
 */
import { FEEDBACK_KEY_PATTERN, MAX_STATUS_ITEMS } from './feedback-rules';
import type { FeedbackDeleteBody, FeedbackStatusItem } from './feedback-types';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

function isItem(value: unknown): value is FeedbackStatusItem {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'key'])) return false;
  return Number.isSafeInteger(value.id) && (value.id as number) > 0 && typeof value.key === 'string' && FEEDBACK_KEY_PATTERN.test(value.key);
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/** The items in their order, or null for anything else (bad JSON, extra fields, bad ids or keys, none or too many). */
export function parseStatusItems(json: string): FeedbackStatusItem[] | null {
  const parsed = parseJson(json);
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['items'])) return null;
  const { items } = parsed;
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_STATUS_ITEMS || !items.every(isItem)) return null;
  return items.map(({ id, key }) => ({ id, key }));
}

/** The id and key of the report to delete, or null for anything else. */
export function parseDeleteBody(json: string): FeedbackDeleteBody | null {
  const parsed = parseJson(json);
  return isItem(parsed) ? { id: parsed.id, key: parsed.key } : null;
}
