/**
 * Player feedback (ROADMAP 50): builds the `POST /feedback` body of
 * feedback-types.ts and sends it once per press on "Senden". The answer maps
 * to a FeedbackResult; nothing throws, queues or retries. Feedback is an
 * explicit player action, so the statistics opt-out and GPC do not block it,
 * but the gate is the same as for statistics: the live worker only from the
 * production host in a production build, otherwise only an explicitly
 * injected test URL, else nothing goes out ('offline'). The session id is the
 * telemetry session of this page load (rate limit only, kept in memory); no
 * name, no device id, and the error log only on a bug report with the box ticked.
 * The answer's new id goes to `onSent` (kept on the device, ROADMAP 57).
 */
import { VIEW_H } from '../core/config';
import { type FetchLike, REQUEST_TIMEOUT_MS, SCORES_URL } from './api';
import type { ErrorLogLike } from './error-log';
import { isFeedbackId } from './feedback-status';
import {
  type FeedbackBody,
  type FeedbackSent,
  type FeedbackKind,
  MAX_FEEDBACK_TEXT,
  MAX_LOG_LINES,
  MAX_VIEW_WIDTH,
  MIN_VIEW_WIDTH,
} from './feedback-types';
import { PRODUCTION_HOST } from './telemetry';
import { jsonBody, timedFetch } from './timed-fetch';
import type { Platform } from './telemetry-types';

/** What the body is built from. */
export interface FeedbackInput {
  session: string;
  kind: FeedbackKind;
  text: string;
  version: string;
  platform: Platform;
  touch: boolean;
  portrait: boolean;
  viewWidth: number;
  /** Ignored for an idea. */
  log: readonly string[];
}

/** The contract body: text trimmed and capped, whole view px in range, the log only for a bug and capped. */
export function feedbackBody(input: FeedbackInput): FeedbackBody {
  return {
    session: input.session,
    kind: input.kind,
    text: input.text.trim().slice(0, MAX_FEEDBACK_TEXT),
    version: input.version,
    platform: input.platform,
    input: input.touch ? 'touch' : 'keys',
    orientation: input.portrait ? 'portrait' : 'landscape',
    viewWidth: Math.min(MAX_VIEW_WIDTH, Math.max(MIN_VIEW_WIDTH, Math.floor(input.viewWidth))),
    log: input.kind === 'bug' ? input.log.slice(-MAX_LOG_LINES) : [],
  };
}

/** The log's last line at send time: where the game was. */
export function stateLine(s: { mode: string; version: string; viewWidth: number; viewHeight: number }): string {
  return `state: mode ${s.mode}, version ${s.version}, view ${s.viewWidth}x${s.viewHeight}`;
}

export interface FeedbackEnv {
  /** location.hostname */
  hostname: string;
  /** import.meta.env.DEV */
  dev: boolean;
  /** An explicit endpoint for manual or play tests (window.__feedbackUrl); never a fallback to the live worker. */
  baseUrl?: string | null;
}

/** Where to send feedback, or null when nothing may go out. */
export function feedbackBaseUrl(env: FeedbackEnv): string | null {
  if (env.baseUrl !== undefined && env.baseUrl !== null) return env.baseUrl ? env.baseUrl.replace(/\/+$/, '') : null;
  return env.hostname === PRODUCTION_HOST && !env.dev ? SCORES_URL : null;
}

/** sent; rate = the server's daily limit (429); invalid = refused (400); offline = network, timeout, 5xx, no endpoint. */
export type FeedbackResult = 'sent' | 'rate' | 'invalid' | 'offline';

/** What the player chose on the form. */
export interface FeedbackDraft {
  kind: FeedbackKind;
  text: string;
  /** "Fehlerprotokoll mitsenden" (only counts for a bug). */
  withLog: boolean;
}

/** What the game knows at send time. */
export interface FeedbackContext {
  platform: Platform;
  touch: boolean;
  portrait: boolean;
  viewWidth: number;
  /** state.mode, for the log's state line. */
  mode: string;
}

export interface FeedbackSenderDeps {
  /** From feedbackBaseUrl; null sends nothing. */
  baseUrl: string | null;
  fetch: FetchLike;
  /** The telemetry session id of this page load. */
  session: string;
  /** BUILD_VERSION */
  version: string;
  /** The error log; null sends an empty log. */
  log: ErrorLogLike | null;
  timeoutMs?: number;
  /** Gets the id of every report the worker stored (the game keeps it for the status check, feedback-status.ts). */
  onSent?: (id: number) => void;
}

/** The part the ui calls. */
export type FeedbackSenderLike = Pick<FeedbackSender, 'send'>;

function resultOf(status: number): FeedbackResult {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 429) return 'rate';
  if (status === 400 || status === 413) return 'invalid';
  return 'offline';
}

export class FeedbackSender {
  constructor(private readonly deps: FeedbackSenderDeps) {}

  async send(draft: FeedbackDraft, context: FeedbackContext): Promise<FeedbackResult> {
    const { baseUrl, version } = this.deps;
    if (baseUrl === null) return 'offline';
    const withLog = draft.kind === 'bug' && draft.withLog && this.deps.log !== null;
    const log = withLog ? this.deps.log!.snapshot(stateLine({ mode: context.mode, version, viewWidth: context.viewWidth, viewHeight: VIEW_H })) : [];
    const body = feedbackBody({ ...context, session: this.deps.session, kind: draft.kind, text: draft.text, version, log });
    // text/plain keeps it a simple CORS request.
    const init = { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) };
    const response = await timedFetch(this.deps.fetch, `${baseUrl}/feedback`, init, this.deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
    if (response === null) return 'offline';
    const result = resultOf(response.status);
    if (result === 'sent') this.keepId(await jsonBody(response));
    return result;
  }

  /** Passes the new report's id of a `{ok: true, id}` answer on; an older worker sends none. */
  private keepId(answer: unknown): void {
    const id = (answer as Partial<FeedbackSent> | null)?.id;
    if (isFeedbackId(id)) this.deps.onSent?.(id);
  }
}
