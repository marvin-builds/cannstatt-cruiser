/** Strict parsing of a `POST /feedback/status` body (ROADMAP 70): exactly {items: [{id, key}, ...]}, 1..MAX_STATUS_ITEMS items. */
import { FEEDBACK_KEY_PATTERN, MAX_STATUS_ITEMS } from './feedback-rules';
import type { FeedbackStatusItem } from './feedback-types';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

function isItem(value: unknown): value is FeedbackStatusItem {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'key'])) return false;
  return Number.isSafeInteger(value.id) && (value.id as number) > 0 && typeof value.key === 'string' && FEEDBACK_KEY_PATTERN.test(value.key);
}

/** The items in their order, or null for anything else (bad JSON, extra fields, bad ids or keys, none or too many). */
export function parseStatusItems(json: string): FeedbackStatusItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['items'])) return null;
  const { items } = parsed;
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_STATUS_ITEMS || !items.every(isItem)) return null;
  return items.map(({ id, key }) => ({ id, key }));
}
