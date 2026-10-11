/**
 * The full-width 'Feedback' card: player bug reports and ideas, newest first,
 * with kind and status filters and the triage actions per item (ROADMAP 56).
 * Player text only ever goes in as text nodes.
 */
import { h } from './dom';
import { FEEDBACK_FILTERS, type FeedbackFilter, feedbackCount, filterFeedback, kindLabel, logSummary, metaLine } from './feedback';
import { type TriageActions, triageControls, type TriageOutcome } from './feedback-triage-ui';
import { formatDate } from './format';
import { issueUrl, logNote, STATUS_FILTERS, type StatusFilter, statusText } from './triage';
import type { TriagedFeedbackEntry } from './triage-types';

export interface FeedbackView {
  /** null: GET /feedback failed (older worker, server error, offline). */
  entries: TriagedFeedbackEntry[] | null;
  filter: FeedbackFilter;
  status: StatusFilter;
}

export interface FeedbackHandlers extends TriageActions {
  onFilter(filter: FeedbackFilter, status: StatusFilter): void;
  /** The list after a triage action succeeded (changed or removed entry). */
  onEntries(entries: TriagedFeedbackEntry[]): void;
}

/** 'Todo #12' as a link to the issue, else the status ('Erledigt in 2026-10-12.1') as a badge. */
function statusBadge(entry: TriagedFeedbackEntry): HTMLElement {
  const label = statusText(entry);
  if (entry.issue === null) return h('span', { class: `fb-status ${entry.status}` }, label);
  return h('a', { class: `fb-status ${entry.status}`, href: issueUrl(entry.issue), target: '_blank', rel: 'noopener noreferrer' }, `${label} #${entry.issue}`);
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
      statusBadge(entry),
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
  let { filter, status } = view;
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
    const shown = filterFeedback(entries, filter, status);
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
      handlers.onFilter(filter, status);
    });
    return button;
  });
  const statuses = h(
    'select',
    { class: 'fb-status-filter', 'aria-label': 'Status filtern' },
    ...STATUS_FILTERS.map(({ value, label }) => h('option', { value, selected: value === status }, label)),
  );
  statuses.addEventListener('change', () => {
    status = STATUS_FILTERS.find((f) => f.value === statuses.value)?.value ?? 'all';
    render();
    handlers.onFilter(filter, status);
  });
  render();
  card.append(
    h(
      'div',
      { class: 'fb-top' },
      h('h2', {}, 'Feedback'),
      h('div', { class: 'fb-filters' }, h('div', { class: 'segmented', role: 'group', 'aria-label': 'Feedback filtern' }, ...kinds), statuses),
    ),
    content,
  );
  return card;
}
