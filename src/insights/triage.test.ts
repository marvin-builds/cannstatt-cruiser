import { describe, expect, it } from 'vitest';
import { VERSION_PATTERN } from '../../server/src/events';
import * as server from '../../server/src/feedback-triage-rules';
import { sampleFeedback } from './sample-feedback';
import {
  STATUS_FILTERS, issueBody, issueTitle, issueUrl, logNote, logSection, parseDoneVersion, statusLabel, statusText, toggleLog, triageErrorText,
} from './triage';
import * as rules from './triage-types';
import type { TriagedFeedbackEntry } from './triage-types';

const [idea, bugWithLog, longBug, markupIdea] = sampleFeedback() as [TriagedFeedbackEntry, TriagedFeedbackEntry, TriagedFeedbackEntry, TriagedFeedbackEntry];

describe('triage rules', () => {
  it('match the worker', () => {
    expect(rules.FEEDBACK_STATUSES).toEqual(server.FEEDBACK_STATUSES);
    expect(rules.ISSUE_REPO).toBe(server.ISSUE_REPO);
    expect(rules.MIN_ISSUE_TITLE).toBe(server.MIN_ISSUE_TITLE);
    expect(rules.MAX_ISSUE_TITLE).toBe(server.MAX_ISSUE_TITLE);
    expect(rules.MAX_ISSUE_BODY).toBe(server.MAX_ISSUE_BODY);
    expect(rules.MAX_REPLY_CHARS).toBe(server.MAX_REPLY_CHARS);
    expect(rules.DONE_VERSION_PATTERN.source).toBe(VERSION_PATTERN.source);
  });
});

describe('parseDoneVersion', () => {
  it('reads an empty field as no version and trims a valid one', () => {
    expect(parseDoneVersion('')).toBeNull();
    expect(parseDoneVersion('   ')).toBeNull();
    expect(parseDoneVersion(' 2026-10-12.1 ')).toBe('2026-10-12.1');
  });
  it('rejects anything but YYYY-MM-DD.n', () => {
    for (const raw of ['2026-10-12', 'v2026-10-12.1', '2026-10-12.123', '12.10.2026', 'bald']) expect(parseDoneVersion(raw), raw).toBeUndefined();
  });
});

describe('statusText', () => {
  it('names the version of a done entry', () => {
    expect(statusText({ status: 'done', doneVersion: '2026-10-12.1' })).toBe('Erledigt in 2026-10-12.1');
    expect(statusText({ status: 'done', doneVersion: null })).toBe('Erledigt');
    expect(statusText({ status: 'todo', doneVersion: null })).toBe('Todo');
  });
});

describe('logNote', () => {
  it('says whether a log was attached', () => {
    expect(logNote(bugWithLog)).toBe('mit Fehlerprotokoll');
    expect(logNote(idea)).toBeNull();
  });
});

describe('statusLabel and STATUS_FILTERS', () => {
  it('names every status in German, with Alle first in the filter', () => {
    expect(rules.FEEDBACK_STATUSES.map(statusLabel)).toEqual(['Offen', 'Todo', 'Erledigt', 'Abgelehnt']);
    expect(STATUS_FILTERS.map((f) => f.label)).toEqual(['Alle Status', 'Offen', 'Todo', 'Erledigt', 'Abgelehnt']);
  });
});

describe('issueUrl', () => {
  it('links into the public repo', () => {
    expect(issueUrl(12)).toBe('https://github.com/marvinmai/cannstatt-cruiser/issues/12');
  });
});

describe('issueTitle', () => {
  it('starts with the kind and takes the first line', () => {
    expect(issueTitle(idea)).toBe('Idee: Bitte mehr Hunde im Park!');
    expect(issueTitle(bugWithLog)).toBe('Fehler: Nach dem Kickflip friert das Bild ein.');
  });
  it('cuts long texts after a few words with an ellipsis and no trailing comma', () => {
    expect(issueTitle(longBug)).toBe('Fehler: Ich finde das Spiel super! Aber manchmal, wenn …');
  });
  it('stays within the worker limit for one very long word', () => {
    const title = issueTitle({ ...longBug, text: 'x'.repeat(400) });
    expect(title.length).toBeLessThanOrEqual(rules.MAX_ISSUE_TITLE);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('issueBody', () => {
  it('quotes the text and adds version, platform, input and view, without the log by default', () => {
    expect(issueBody(idea, false)).toBe(
      '> Bitte mehr Hunde im Park!\n> Und eine Brezel als Bonus.\n\n' +
        'Version 2026-10-11.4 · Android · Touch · Hoch · 390 px\n\n' +
        'Spieler-Feedback (Idee) vom 11.10.2026, vor dem Veröffentlichen geprüft.',
    );
    expect(issueBody(bugWithLog, false)).not.toContain('Fehlerprotokoll');
  });
  it('keeps blank lines of the text inside the quote', () => {
    expect(issueBody(longBug, false)).toContain('unterwegs sind.\n>\n> Vielleicht');
  });
  it('defuses @mentions so players cannot ping GitHub users', () => {
    const body = issueBody({ ...idea, text: 'Grüße an @octocat und mail@example.org' }, false);
    expect(body).not.toMatch(/(^|\s)@octocat/);
    expect(body).toContain('octocat');
  });
  it('adds the log as a collapsed code block when asked', () => {
    const body = issueBody(bugWithLog, true);
    expect(body.endsWith(logSection(bugWithLog.log))).toBe(true);
    expect(logSection(bugWithLog.log)).toBe(
      '\n\n<details><summary>Fehlerprotokoll</summary>\n\n```text\n' + bugWithLog.log.join('\n') + '\n```\n\n</details>',
    );
  });
  it('uses a longer fence when a log line has backticks', () => {
    expect(logSection(['a ``` b'])).toContain('````text\na ``` b\n````');
  });
  it('is never longer than the worker allows, even with markup in the text', () => {
    expect(issueBody(markupIdea, false)).toContain('> <script>alert("hi")</script> ein Level im Schlossgarten');
    const longest = { ...bugWithLog, text: 'x'.repeat(500), log: Array(20).fill('y'.repeat(200)) };
    expect(issueBody(longest, true).length).toBeLessThanOrEqual(rules.MAX_ISSUE_BODY);
  });
});

describe('toggleLog', () => {
  it('appends the log section once and removes it again, keeping the operator\'s edits', () => {
    const edited = issueBody(bugWithLog, false).replace('friert', 'hängt');
    const withLog = toggleLog(edited, bugWithLog.log, true);
    expect(withLog).toBe(edited + logSection(bugWithLog.log));
    expect(toggleLog(withLog, bugWithLog.log, true)).toBe(withLog);
    expect(toggleLog(withLog, bugWithLog.log, false)).toBe(edited);
  });
  it('trims trailing space before appending', () => {
    expect(toggleLog('Text  \n\n', ['x'], true)).toBe('Text' + logSection(['x']));
  });
});

describe('triageErrorText', () => {
  it('explains every failure in German', () => {
    expect(triageErrorText({ error: 'github-token-missing' })).toMatch(/GITHUB_TOKEN/);
    expect(triageErrorText({ error: 'github', status: 403 })).toBe('GitHub hat abgelehnt (Status 403).');
    expect(triageErrorText({ error: 'github', status: 0 })).toBe('GitHub nicht erreichbar.');
    expect(triageErrorText({ error: 'github', status: 401 })).toBe('GitHub-Token ungültig, neu setzen');
    expect(triageErrorText({ error: 'exists', issue: 5 })).toBe('Hat schon Issue #5.');
    expect(triageErrorText({ error: 'auth' })).toBe('Token falsch');
    for (const error of ['offline', 'server', 'not-found', 'bad-request'] as const) expect(triageErrorText({ error })).not.toBe('');
  });
});
