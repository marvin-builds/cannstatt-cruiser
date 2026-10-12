/**
 * The 'Feedback' card of the Feedback tab: player bug reports and ideas, newest first, with the kind filter,
 * the status chips (ROADMAP 80), the linked issue with its GitHub state (ROADMAP 82) and the ticket actions
 * per item (ROADMAP 83). Player text only ever goes in as text nodes.
 */
import { h } from './dom';
import { FEEDBACK_FILTERS, type FeedbackFilter, feedbackCount, filterFeedback, kindLabel, logSummary, metaLine } from './feedback';
import { type TriageActions, triageControls, type TriageOutcome } from './feedback-triage-ui';
import { formatDate } from './format';
import { issueStateText, readyToClose } from './ticket-actions';
import { issueUrl, logNote, STATUS_CHIPS, statusText, toggleStatus } from './triage';
import type { FeedbackStatus, TriagedFeedbackEntry } from './triage-types';

export interface FeedbackView {
  /** null: GET /feedback failed (older worker, server error, offline). */
  entries: TriagedFeedbackEntry[] | null;
  filter: FeedbackFilter;
  /** The status chips that are on. */
  statuses: readonly FeedbackStatus[];
}

export interface FeedbackHandlers extends TriageActions {
  onFilter(filter: FeedbackFilter, statuses: readonly FeedbackStatus[]): void;
  /** The list after a triage action succeeded (changed or removed entry). */
  onEntries(entries: TriagedFeedbackEntry[]): void;
}

/** The linked issue with its state ('#7 · erledigt am 12.10.') as a link, or nothing. */
function issueLink(entry: TriagedFeedbackEntry): HTMLElement | null {
  const text = issueStateText(entry);
  if (entry.issue === null || text === null) return null;
  return h('a', { class: `fb-issue ${entry.issueState ?? ''}`.trim(), href: issueUrl(entry.issue), target: '_blank', rel: 'noopener noreferrer' }, text);
}

function item(entry: TriagedFeedbackEntry, handlers: FeedbackHandlers, outcome: TriageOutcome): HTMLElement {
  const withLog = logNote(entry);
  const log = entry.log.length
    ? h('details', { class: 'fb-log' }, h('summary', {}, logSummary(entry.log.length)), h('pre', {}, entry.log.join('\n')))
    : null;
  return h(
    'li',
    { class: 'fb-item', 'data-id': entry.id },
    h(
      'div',
      { class: 'fb-head' },
      h('span', { class: `fb-kind ${entry.kind}` }, kindLabel(entry.kind)),
      h('span', { class: `fb-status ${entry.status}` }, statusText(entry)),
      issueLink(entry),
      readyToClose(entry) ? h('span', { class: 'fb-ready' }, 'bereit zum Abschließen') : null,
      withLog ? h('span', { class: 'fb-has-log' }, withLog) : null,
      h('time', { datetime: entry.day }, formatDate(entry.day)),
    ),
    h('p', { class: 'fb-text' }, entry.text),
    h('p', { class: 'fb-meta' }, metaLine(entry)),
    entry.reply ? h('p', { class: 'fb-reply' }, h('span', {}, 'Antwort: '), entry.reply) : null,
    log,
    triageControls(entry, handlers, outcome),
  );
}

export function feedbackCard(view: FeedbackView, handlers: FeedbackHandlers): HTMLElement {
  const card = h('section', { class: 'card feedback' });
  if (!view.entries) {
    card.append(h('h2', {}, 'Feedback'), h('p', { class: 'empty-note' }, 'Feedback gerade nicht abrufbar'));
    return card;
  }
  let entries = view.entries;
  let { filter, statuses } = view;
  const content = h('div', { class: 'fb-body' });

  const outcome: TriageOutcome = {
    changed(id, triage) {
      entries = entries.map((e) => (e.id === id ? { ...e, ...triage } : e));
      handlers.onEntries(entries);
      render();
    },
    removed(id) {
      entries = entries.filter((e) => e.id !== id);
      handlers.onEntries(entries);
      render();
    },
  };

  function render(): void {
    const shown = filterFeedback(entries, filter, statuses);
    const count = h('p', { class: 'card-note fb-count', 'aria-live': 'polite' }, feedbackCount(shown.length));
    if (!shown.length) {
      content.replaceChildren(count, h('p', { class: 'empty-note' }, entries.length ? 'Kein Feedback in diesem Filter' : 'Noch kein Feedback'));
    } else {
      content.replaceChildren(count, h('ol', { class: 'fb-list' }, ...shown.map((entry) => item(entry, handlers, outcome))));
    }
  }

  const kinds = FEEDBACK_FILTERS.map(({ value, label }) => {
    const button = h('button', { type: 'button', 'aria-pressed': String(value === filter) }, label);
    button.addEventListener('click', () => {
      for (const b of kinds) b.setAttribute('aria-pressed', String(b === button));
      filter = value;
      render();
      handlers.onFilter(filter, statuses);
    });
    return button;
  });
  const chips = STATUS_CHIPS.map(({ value, label }) => {
    const chip = h('button', { type: 'button', class: `chip ${value}`, 'aria-pressed': String(statuses.includes(value)) }, label);
    chip.addEventListener('click', () => {
      statuses = toggleStatus(statuses, value);
      chip.setAttribute('aria-pressed', String(statuses.includes(value)));
      render();
      handlers.onFilter(filter, statuses);
    });
    return chip;
  });
  render();
  card.append(
    h(
      'div',
      { class: 'fb-top' },
      h('h2', {}, 'Feedback'),
      h(
        'div',
        { class: 'fb-filters' },
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Art filtern' }, ...kinds),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Status filtern' }, ...chips),
      ),
    ),
    content,
  );
  return card;
}
