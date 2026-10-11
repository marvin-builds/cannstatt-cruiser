/** Strict parsing of the triage routes' path id and bodies (`POST /feedback/:id/issue`, `PATCH /feedback/:id`). */
import { FEEDBACK_STATUSES, MAX_ISSUE_BODY, MAX_ISSUE_TITLE, MAX_REPLY_CHARS, MIN_ISSUE_TITLE } from './feedback-triage-rules';
import type { FeedbackStatus, IssueDraft, TriagePatch } from './feedback-triage-types';

const CONTROL = /\p{Cc}/u;
/** The issue body may keep line breaks and tabs (log lines, quotes). */
const CONTROL_EXCEPT_LINES = /(?![\n\t])\p{Cc}/u;
const ID = /^[1-9]\d{0,15}$/;

/** A row id from the path: a positive safe integer in plain decimal, else null. */
export function parseFeedbackId(raw: string): number | null {
  if (!ID.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

function parseObject(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const onlyKeys = (body: Record<string, unknown>, allowed: readonly string[]) => Object.keys(body).every((key) => allowed.includes(key));

/** The draft with a one-line title and a trimmed body, or null. */
export function parseIssueDraft(json: string): IssueDraft | null {
  const body = parseObject(json);
  if (!body || !onlyKeys(body, ['title', 'body']) || typeof body.title !== 'string' || typeof body.body !== 'string') return null;
  const title = body.title.replace(/\s+/g, ' ').trim();
  const text = body.body.replace(/\r\n?/g, '\n').trim();
  if (CONTROL.test(title) || CONTROL_EXCEPT_LINES.test(text)) return null;
  if (title.length < MIN_ISSUE_TITLE || title.length > MAX_ISSUE_TITLE || !text || text.length > MAX_ISSUE_BODY) return null;
  return { title, body: text };
}

/** A trimmed one-line reply ('' and null clear it), or undefined when invalid. */
function parseReply(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || CONTROL.test(value)) return undefined;
  const reply = value.trim();
  if (reply.length > MAX_REPLY_CHARS) return undefined;
  return reply || null;
}

/** A patch of status and/or reply, or null for anything else (also an empty patch). */
export function parseTriagePatch(json: string): TriagePatch | null {
  const body = parseObject(json);
  if (!body || !Object.keys(body).length || !onlyKeys(body, ['status', 'reply'])) return null;
  const patch: TriagePatch = {};
  if (Object.hasOwn(body, 'status')) {
    if (!FEEDBACK_STATUSES.includes(body.status as FeedbackStatus)) return null;
    patch.status = body.status as FeedbackStatus;
  }
  if (Object.hasOwn(body, 'reply')) {
    const reply = parseReply(body.reply);
    if (reply === undefined) return null;
    patch.reply = reply;
  }
  return patch;
}
