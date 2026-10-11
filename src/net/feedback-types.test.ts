import { describe, expect, it } from 'vitest';
import { VIEW_MAX_W, VIEW_W } from '../core/config';
import * as client from './feedback-types';
import * as server from '../../server/src/feedback-rules';
import * as serverTriage from '../../server/src/feedback-triage-rules';

describe('feedback contract', () => {
  it('offers a bug report and an idea', () => {
    expect(client.FEEDBACK_KINDS).toEqual(['bug', 'idea']);
  });

  it('accepts every view width the game can have', () => {
    expect(client.MIN_VIEW_WIDTH).toBe(VIEW_W);
    expect(client.MAX_VIEW_WIDTH).toBe(VIEW_MAX_W);
  });

  it('keeps the limits consistent', () => {
    expect(client.MIN_FEEDBACK_TEXT).toBeLessThan(client.MAX_FEEDBACK_TEXT);
    const fullLog = client.MAX_LOG_LINES * client.MAX_LOG_LINE_CHARS;
    // A body at every limit (text and log in UTF-8, up to 3 bytes per char) still fits.
    expect(3 * (client.MAX_FEEDBACK_TEXT + fullLog) + 512).toBeLessThanOrEqual(client.MAX_FEEDBACK_BYTES);
    expect(client.FEEDBACK_RETENTION_DAYS).toBe(365);
  });

  it('is mirrored exactly by the server', () => {
    expect(server.FEEDBACK_KINDS).toEqual(client.FEEDBACK_KINDS);
    expect(server.MIN_FEEDBACK_TEXT).toBe(client.MIN_FEEDBACK_TEXT);
    expect(server.MAX_FEEDBACK_TEXT).toBe(client.MAX_FEEDBACK_TEXT);
    expect(server.MAX_LOG_LINES).toBe(client.MAX_LOG_LINES);
    expect(server.MAX_LOG_LINE_CHARS).toBe(client.MAX_LOG_LINE_CHARS);
    expect(server.MAX_FEEDBACK_BYTES).toBe(client.MAX_FEEDBACK_BYTES);
    expect(server.MIN_VIEW_WIDTH).toBe(client.MIN_VIEW_WIDTH);
    expect(server.MAX_VIEW_WIDTH).toBe(client.MAX_VIEW_WIDTH);
    expect(server.FEEDBACK_PER_SESSION_PER_DAY).toBe(client.FEEDBACK_PER_SESSION_PER_DAY);
    expect(server.FEEDBACK_RETENTION_DAYS).toBe(client.FEEDBACK_RETENTION_DAYS);
    expect(server.FEEDBACK_LIST_LIMIT).toBe(client.FEEDBACK_LIST_LIMIT);
    expect(server.MAX_STATUS_IDS).toBe(client.MAX_STATUS_IDS);
    expect(serverTriage.FEEDBACK_STATUSES).toEqual(client.FEEDBACK_STATUSES);
    expect(serverTriage.MAX_REPLY_CHARS).toBe(client.MAX_REPLY_CHARS);
  });
});
