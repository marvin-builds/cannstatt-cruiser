/**
 * Type-level check (run by `tsc --noEmit`): the server's copies of the feedback
 * shapes equal the game's contract in src/net/feedback-types.ts.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type * as client from '../../src/net/feedback-types';
import type * as server from '../src/feedback-types';

describe('feedback types', () => {
  it('match the game contract', () => {
    expectTypeOf<server.FeedbackKind>().toEqualTypeOf<client.FeedbackKind>();
    expectTypeOf<server.FeedbackBody>().toEqualTypeOf<client.FeedbackBody>();
    expectTypeOf<server.FeedbackEntry>().toEqualTypeOf<client.FeedbackEntry>();
    expectTypeOf<server.FeedbackList>().toEqualTypeOf<client.FeedbackList>();
    expectTypeOf<server.FeedbackSent>().toEqualTypeOf<client.FeedbackSent>();
    expectTypeOf<server.FeedbackStatusItem>().toEqualTypeOf<client.FeedbackStatusItem>();
    expectTypeOf<server.FeedbackStatusQuery>().toEqualTypeOf<client.FeedbackStatusQuery>();
    expectTypeOf<server.FeedbackStatusEntry>().toEqualTypeOf<client.FeedbackStatusEntry>();
    expectTypeOf<server.FeedbackStatusList>().toEqualTypeOf<client.FeedbackStatusList>();
    expectTypeOf<server.FeedbackDeleteBody>().toEqualTypeOf<client.FeedbackDeleteBody>();
  });
});
