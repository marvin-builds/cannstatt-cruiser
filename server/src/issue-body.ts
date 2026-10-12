/** The text of a feedback issue on GitHub: the operator's draft, then the developer addition in its own section (ROADMAP 75). */
import type { IssueDraft } from './feedback-triage-types';

/** The heading that marks the developer's own words, so they never read as the player's. */
export const ADDITION_HEADING = '**Ergänzung des Entwicklers**';

/**
 * The draft body, and with an addition a rule and the marked section after it. The blank line before the rule
 * ends any quote the body ends with, so the addition never lands inside the player's quoted text.
 */
export function issueText({ body, addition }: IssueDraft): string {
  return addition ? `${body}\n\n---\n\n${ADDITION_HEADING}\n\n${addition}` : body;
}
