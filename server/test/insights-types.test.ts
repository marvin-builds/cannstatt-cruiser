/**
 * Type-level check (run by `tsc --noEmit`): the server's copies of the event
 * and stats shapes equal the game's contract in src/net/telemetry-types.ts.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type * as client from '../../src/net/telemetry-types';
import type * as server from '../src/insights-types';

describe('insights types', () => {
  it('match the game contract', () => {
    expectTypeOf<server.SessionEvent>().toEqualTypeOf<client.SessionEvent>();
    expectTypeOf<server.RunEvent>().toEqualTypeOf<client.RunEvent>();
    expectTypeOf<server.EndEvent>().toEqualTypeOf<client.EndEvent>();
    expectTypeOf<server.TelemetryEvent>().toEqualTypeOf<client.TelemetryEvent>();
    expectTypeOf<server.CountEntry>().toEqualTypeOf<client.CountEntry>();
    expectTypeOf<server.DayStats>().toEqualTypeOf<client.DayStats>();
    expectTypeOf<server.InsightsStats>().toEqualTypeOf<client.InsightsStats>();
  });
});
