import { describe, expect, it } from 'vitest';
import { BUILD_VERSION } from '../changelog';
import * as client from './telemetry-types';
import * as server from '../../server/src/events';

describe('telemetry contract', () => {
  it('accepts the current build version', () => {
    expect(client.VERSION_PATTERN.test(BUILD_VERSION)).toBe(true);
  });

  it('rejects versions that are not YYYY-MM-DD.n', () => {
    expect(client.VERSION_PATTERN.test('2026-10-11.1<script>')).toBe(false);
    expect(client.VERSION_PATTERN.test('dev')).toBe(false);
  });

  it('matches the session id format of newSessionId-style ids', () => {
    expect(client.SESSION_ID_PATTERN.test('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(client.SESSION_ID_PATTERN.test('not-an-id')).toBe(false);
  });

  it('is mirrored exactly by the server', () => {
    expect(server.EVENT_KINDS).toEqual(client.EVENT_KINDS);
    expect(server.INPUTS).toEqual(client.INPUTS);
    expect(server.ORIENTATIONS).toEqual(client.ORIENTATIONS);
    expect(server.PLATFORMS).toEqual(client.PLATFORMS);
    expect(server.SCORE_BUCKETS).toEqual(client.SCORE_BUCKETS);
    expect(server.STATS_RANGES).toEqual(client.STATS_RANGES);
    expect(server.DISTANCE_STEP_M).toBe(client.DISTANCE_STEP_M);
    expect(server.MAX_DISTANCE_M).toBe(client.MAX_DISTANCE_M);
    expect(server.RUN_SECONDS_STEP).toBe(client.RUN_SECONDS_STEP);
    expect(server.MAX_RUN_SECONDS).toBe(client.MAX_RUN_SECONDS);
    expect(server.MAX_END_SECONDS).toBe(client.MAX_END_SECONDS);
    expect(server.MAX_EVENT_BYTES).toBe(client.MAX_EVENT_BYTES);
    expect(server.MIN_GROUP_SESSIONS).toBe(client.MIN_GROUP_SESSIONS);
    expect(server.VERSION_PATTERN.source).toBe(client.VERSION_PATTERN.source);
    expect(server.SESSION_ID_PATTERN.source).toBe(client.SESSION_ID_PATTERN.source);
  });
});
