/**
 * Type-level check (run by `tsc --noEmit`): the board's copy of the triage
 * shapes (src/insights/triage-types.ts) equals the worker's.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type * as board from '../../src/insights/triage-types';
import type * as server from '../src/feedback-triage-types';

describe('feedback triage types', () => {
  it('match the board', () => {
    expectTypeOf<server.FeedbackStatus>().toEqualTypeOf<board.FeedbackStatus>();
    expectTypeOf<server.FeedbackTriage>().toEqualTypeOf<board.FeedbackTriage>();
    expectTypeOf<server.TriagedFeedbackEntry>().toEqualTypeOf<board.TriagedFeedbackEntry>();
    expectTypeOf<server.TriagedFeedbackList>().toEqualTypeOf<board.TriagedFeedbackList>();
    expectTypeOf<server.IssueDraft>().toEqualTypeOf<board.IssueDraft>();
    expectTypeOf<server.TriagePatch>().toEqualTypeOf<board.TriagePatch>();
    expectTypeOf<server.IssueState>().toEqualTypeOf<board.IssueState>();
    expectTypeOf<server.IssueLink>().toEqualTypeOf<board.IssueLink>();
  });
});
