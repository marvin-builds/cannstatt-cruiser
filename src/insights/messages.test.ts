import { describe, expect, it } from 'vitest';
import {
  defaultMessages, doneMessage, NOT_PLANNED_MESSAGE, PLANNED_MESSAGE, rejectMessages, REOPEN_DONE_MESSAGE, REOPEN_REJECTED_MESSAGE,
} from './messages';
import { MAX_REPLY_CHARS } from './triage-types';

describe('default player messages', () => {
  it('has the texts of ROADMAP 83', () => {
    expect(PLANNED_MESSAGE).toBe('Die Umsetzung deines Feedbacks wurde geplant, danke für dein Feedback!');
    expect(REOPEN_DONE_MESSAGE).toBe('Wir kümmern uns nochmal darum.');
    expect(REOPEN_REJECTED_MESSAGE).toBe('Wir schauen uns dein Feedback nochmal an.');
    expect(NOT_PLANNED_MESSAGE).toMatch(/versucht/);
  });

  it('offers two or three rejection texts per kind, bugs with "nicht nachstellen"', () => {
    for (const kind of ['bug', 'idea'] as const) {
      expect(rejectMessages(kind).length).toBeGreaterThanOrEqual(2);
      expect(rejectMessages(kind).length).toBeLessThanOrEqual(3);
    }
    expect(rejectMessages('bug')[0]).toBe('Danke! Das konnten wir leider nicht nachstellen.');
    expect(rejectMessages('idea')[0]).toBe('Danke für dein Feedback! Das passt leider nicht ins Spiel.');
  });

  it('names the version in the done message, or says it is in the game without one', () => {
    expect(doneMessage('2026-10-12.3')).toBe('Ist drin seit Version 2026-10-12.3. Danke für dein Feedback!');
    expect(doneMessage(null)).toBe('Ist jetzt im Spiel. Danke für dein Feedback!');
  });

  it.each(defaultMessages())('"%s" fits MAX_REPLY_CHARS on one line', (message) => {
    expect(message.trim()).toBe(message);
    expect(message.length).toBeGreaterThan(0);
    expect(message.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
    expect(message).not.toMatch(/\n/);
  });

  it('lists every default text, the done message with the longest version', () => {
    const all = defaultMessages();
    for (const text of [PLANNED_MESSAGE, NOT_PLANNED_MESSAGE, REOPEN_DONE_MESSAGE, REOPEN_REJECTED_MESSAGE, ...rejectMessages('bug'), ...rejectMessages('idea')]) {
      expect(all).toContain(text);
    }
    expect(all).toContain(doneMessage('2026-10-12.99'));
  });
});
