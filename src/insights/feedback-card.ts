/**
 * The full-width 'Feedback' card: player bug reports and ideas, newest first,
 * with a client-side filter. Player text only ever goes in as text nodes.
 */
import type { FeedbackEntry } from '../net/feedback-types';
import { h } from './dom';
import { FEEDBACK_FILTERS, type FeedbackFilter, feedbackCount, filterFeedback, kindLabel, logSummary, metaLine } from './feedback';
import { formatDate } from './format';

export interface FeedbackView {
  /** null: GET /feedback failed (older worker, server error, offline). */
  entries: FeedbackEntry[] | null;
  filter: FeedbackFilter;
}

function item(entry: FeedbackEntry): HTMLElement {
  const log = entry.log.length
    ? h('details', { class: 'fb-log' }, h('summary', {}, logSummary(entry.log.length)), h('pre', {}, entry.log.join('\n')))
    : null;
  return h(
    'li',
    { class: 'fb-item' },
    h(
      'div',
      { class: 'fb-head' },
      h('span', { class: `fb-kind ${entry.kind}` }, kindLabel(entry.kind)),
      h('time', { datetime: entry.day }, formatDate(entry.day)),
    ),
    h('p', { class: 'fb-text' }, entry.text),
    h('p', { class: 'fb-meta' }, metaLine(entry)),
    log,
  );
}

function body(entries: FeedbackEntry[], filter: FeedbackFilter): HTMLElement[] {
  const shown = filterFeedback(entries, filter);
  const count = h('p', { class: 'card-note fb-count', 'aria-live': 'polite' }, feedbackCount(shown.length));
  if (!shown.length) return [count, h('p', { class: 'empty-note' }, entries.length ? 'Kein Feedback in diesem Filter' : 'Noch kein Feedback')];
  return [count, h('ol', { class: 'fb-list' }, ...shown.map(item))];
}

export function feedbackCard(view: FeedbackView, onFilter: (filter: FeedbackFilter) => void): HTMLElement {
  const card = h('section', { class: 'card feedback' });
  const { entries } = view;
  if (!entries) {
    card.append(h('h2', {}, 'Feedback'), h('p', { class: 'empty-note' }, 'Feedback gerade nicht abrufbar'));
    return card;
  }
  const content = h('div', { class: 'fb-body' });
  const buttons = FEEDBACK_FILTERS.map(({ value, label }) => {
    const button = h('button', { type: 'button', 'aria-pressed': String(value === view.filter) }, label);
    button.addEventListener('click', () => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
      content.replaceChildren(...body(entries, value));
      onFilter(value);
    });
    return button;
  });
  content.replaceChildren(...body(entries, view.filter));
  card.append(
    h('div', { class: 'fb-top' }, h('h2', {}, 'Feedback'), h('div', { class: 'segmented', role: 'group', 'aria-label': 'Feedback filtern' }, ...buttons)),
    content,
  );
  return card;
}
