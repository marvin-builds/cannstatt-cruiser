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
 */
import { VIEW_H } from '../core/config';
import { type FetchLike, REQUEST_TIMEOUT_MS, SCORES_URL } from './api';
import type { ErrorLogLike } from './error-log';
import {
  type FeedbackBody,
  type FeedbackKind,
  MAX_FEEDBACK_TEXT,
  MAX_LOG_LINES,
  MAX_VIEW_WIDTH,
  MIN_VIEW_WIDTH,
} from './feedback-types';
import { PRODUCTION_HOST } from './telemetry';
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
    const status = await this.post(`${baseUrl}/feedback`, JSON.stringify(body));
    return status === null ? 'offline' : resultOf(status);
  }

  /** The answer's status, or null when offline or timed out. text/plain keeps it a simple CORS request. */
  private async post(url: string, body: string): Promise<number | null> {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller?.abort();
        resolve(null);
      }, this.deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
    });
    const call = async () => {
      const response = await this.deps.fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, signal: controller?.signal });
      return response.status;
    };
    try {
      return await Promise.race([call(), timeout]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
