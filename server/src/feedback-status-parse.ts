/** Strict parsing of `GET /feedback/status?ids=1,2,3` (ROADMAP 57): only `ids`, once, 1..MAX_STATUS_IDS positive ids. */
import { MAX_STATUS_IDS } from './feedback-rules';
import { parseFeedbackId } from './feedback-triage-parse';

/** Digits and single commas only, short enough for MAX_STATUS_IDS safe integers. */
const ID_LIST = /^\d+(,\d+)*$/;
const MAX_LIST_CHARS = MAX_STATUS_IDS * 17;

/** The distinct ids in their order, or null for anything else (no, repeated or extra parameters, bad ids, too many). */
export function parseStatusIds(params: URLSearchParams): number[] | null {
  if ([...params.keys()].some((key) => key !== 'ids')) return null;
  const values = params.getAll('ids');
  if (values.length !== 1) return null;
  const raw = values[0]!;
  if (raw.length > MAX_LIST_CHARS || !ID_LIST.test(raw)) return null;
  const ids: number[] = [];
  for (const part of raw.split(',')) {
    const id = parseFeedbackId(part);
    if (id === null) return null;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.length <= MAX_STATUS_IDS ? ids : null;
}
