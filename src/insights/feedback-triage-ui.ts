/**
 * Triage actions of one feedback card item (ROADMAP 56): 'Todo' opens the
 * GitHub issue editor, 'Status' the status and reply editor (with
 * 'umgesetzt in Version' for Erledigt, ROADMAP 70), 'Löschen' a confirm step. One panel at a time; a failure shows a short note in the item.
 * Player text only ever goes in as text nodes and form values.
 */
import type { TriageResult } from './client';
import { h } from './dom';
import { logSummary } from './feedback';
import { issueBody, issueTitle, parseDoneVersion, STATUS_FILTERS, toggleLog, triageErrorText } from './triage';
import {
  FEEDBACK_STATUSES, MAX_ISSUE_BODY, MAX_ISSUE_TITLE, MAX_REPLY_CHARS, MIN_ISSUE_TITLE,
  type FeedbackStatus, type FeedbackTriage, type IssueDraft, type TriagedFeedbackEntry, type TriagePatch,
} from './triage-types';

/** The worker calls; each resolves, never throws. */
export interface TriageActions {
  createIssue(id: number, draft: IssueDraft): Promise<TriageResult<{ issue: number }>>;
  patch(id: number, patch: TriagePatch): Promise<TriageResult<{ triage: FeedbackTriage }>>;
  remove(id: number): Promise<TriageResult<object>>;
}

/** What the card does after a successful action: show the new triage fields, or drop the entry. */
export interface TriageOutcome {
  changed(id: number, triage: FeedbackTriage): void;
  removed(id: number): void;
}

const STATUS_CHOICES = STATUS_FILTERS.filter((f): f is { value: FeedbackStatus; label: string } => f.value !== 'all');

function field(label: string, control: HTMLElement): HTMLElement {
  return h('label', { class: 'fb-field' }, h('span', {}, label), control);
}

function buttonRow(primary: HTMLButtonElement, cancel: () => void): HTMLElement {
  const back = h('button', { type: 'button', class: 'ghost' }, 'Abbrechen');
  back.addEventListener('click', cancel);
  return h('div', { class: 'fb-buttons' }, primary, back);
}

/** Runs `call` with the panel's buttons disabled; shows the failure in `note`, or hands the success on. */
async function submit<T>(panel: HTMLElement, note: HTMLElement, call: () => Promise<TriageResult<T>>, done: (result: T) => void): Promise<void> {
  const controls = [...panel.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('button, input, textarea, select')];
  for (const c of controls) c.disabled = true;
  note.textContent = '';
  const result = await call();
  for (const c of controls) c.disabled = false;
  if (result.ok) done(result);
  else note.textContent = triageErrorText(result);
}

function issueEditor(entry: TriagedFeedbackEntry, actions: TriageActions, outcome: TriageOutcome, close: () => void): HTMLElement {
  const note = h('p', { class: 'fb-error', role: 'alert' });
  const title = h('input', { type: 'text', name: 'title', required: true, minlength: MIN_ISSUE_TITLE, maxlength: MAX_ISSUE_TITLE, autocomplete: 'off' });
  title.value = issueTitle(entry);
  const body = h('textarea', { name: 'body', rows: 9, required: true, maxlength: MAX_ISSUE_BODY });
  body.value = issueBody(entry, false);
  let withLog: HTMLElement | null = null;
  if (entry.log.length) {
    const box = h('input', { type: 'checkbox', name: 'log' });
    box.addEventListener('change', () => (body.value = toggleLog(body.value, entry.log, box.checked)));
    withLog = h('label', { class: 'fb-check' }, box, h('span', {}, `${logSummary(entry.log.length)} anhängen`));
  }
  const send = h('button', { type: 'submit' }, 'Issue anlegen');
  const form = h(
    'form',
    { class: 'fb-panel', 'aria-label': 'GitHub-Issue anlegen' },
    h('p', { class: 'fb-hint' }, 'Das Repo ist öffentlich: vorher alles Persönliche entfernen.'),
    field('Titel', title),
    field('Text', body),
    withLog,
    buttonRow(send, close),
    note,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = { title: title.value, body: body.value };
    void submit(form, note, () => actions.createIssue(entry.id, draft), ({ issue }) => outcome.changed(entry.id, { status: 'todo', issue, reply: entry.reply, doneVersion: null }));
  });
  return form;
}

function statusEditor(entry: TriagedFeedbackEntry, actions: TriageActions, outcome: TriageOutcome, close: () => void): HTMLElement {
  const note = h('p', { class: 'fb-error', role: 'alert' });
  const status = h('select', { name: 'status' }, ...STATUS_CHOICES.map(({ value, label }) => h('option', { value, selected: value === entry.status }, label)));
  const version = h('input', {
    type: 'text', name: 'doneVersion', autocomplete: 'off', spellcheck: 'false', maxlength: 13, placeholder: 'z. B. 2026-10-12.1',
  });
  version.value = entry.doneVersion ?? '';
  version.addEventListener('input', () => (note.textContent = ''));
  const versionField = field('Umgesetzt in Version (optional)', version);
  const showVersion = () => (versionField.hidden = status.value !== 'done');
  status.addEventListener('change', showVersion);
  showVersion();
  const reply = h('input', { type: 'text', name: 'reply', maxlength: MAX_REPLY_CHARS, autocomplete: 'off', placeholder: 'z. B. Kommt in der nächsten Version' });
  reply.value = entry.reply ?? '';
  const save = h('button', { type: 'submit' }, 'Speichern');
  const form = h(
    'form',
    { class: 'fb-panel', 'aria-label': 'Status ändern' },
    field('Status', status),
    versionField,
    field('Kurze Antwort (optional; der Spieler sieht sie im Spiel unter „Mein Feedback“ auf seinem Gerät)', reply),
    buttonRow(save, close),
    note,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const chosen = FEEDBACK_STATUSES.find((s) => s === status.value) ?? entry.status;
    const patch: TriagePatch = { status: chosen, reply: reply.value.trim() || null };
    if (chosen === 'done') {
      const doneVersion = parseDoneVersion(version.value);
      if (doneVersion === undefined) {
        note.textContent = 'Version im Format JJJJ-MM-TT.n, z. B. 2026-10-12.1 (oder leer lassen).';
        version.focus();
        return;
      }
      patch.doneVersion = doneVersion;
    }
    void submit(form, note, () => actions.patch(entry.id, patch), ({ triage }) => outcome.changed(entry.id, triage));
  });
  return form;
}

function deleteConfirm(entry: TriagedFeedbackEntry, actions: TriageActions, outcome: TriageOutcome, close: () => void): HTMLElement {
  const note = h('p', { class: 'fb-error', role: 'alert' });
  const confirm = h('button', { type: 'button', class: 'danger' }, 'Ja, löschen');
  const panel = h(
    'div',
    { class: 'fb-panel fb-confirm', role: 'group', 'aria-label': 'Löschen bestätigen' },
    h('p', { class: 'fb-hint' }, 'Wirklich löschen? Das lässt sich nicht rückgängig machen.'),
    buttonRow(confirm, close),
    note,
  );
  confirm.addEventListener('click', () => void submit(panel, note, () => actions.remove(entry.id), () => outcome.removed(entry.id)));
  return panel;
}

type PanelKind = 'issue' | 'status' | 'delete';
const PANELS: Record<PanelKind, typeof issueEditor> = { issue: issueEditor, status: statusEditor, delete: deleteConfirm };

/** The action buttons and the place where their panel opens. */
export function triageControls(entry: TriagedFeedbackEntry, actions: TriageActions, outcome: TriageOutcome): HTMLElement {
  const slot = h('div', { class: 'fb-slot' });
  const buttons: { kind: PanelKind; label: string }[] = [
    ...(entry.issue === null ? [{ kind: 'issue' as const, label: 'Todo' }] : []),
    { kind: 'status', label: 'Status' },
    { kind: 'delete', label: 'Löschen' },
  ];
  const bar = h('div', { class: 'fb-actions' });
  let open: PanelKind | null = null;
  const close = () => {
    open = null;
    slot.replaceChildren();
    for (const b of bar.children) b.setAttribute('aria-expanded', 'false');
  };
  for (const { kind, label } of buttons) {
    const button = h('button', { type: 'button', class: kind === 'delete' ? 'ghost small danger-text' : 'ghost small', 'aria-expanded': 'false' }, label);
    button.addEventListener('click', () => {
      if (open === kind) return close();
      close();
      open = kind;
      button.setAttribute('aria-expanded', 'true');
      const panel = PANELS[kind](entry, actions, outcome, close);
      slot.replaceChildren(panel);
      panel.querySelector<HTMLElement>('input, select')?.focus();
    });
    bar.append(button);
  }
  return h('div', { class: 'fb-triage' }, bar, slot);
}
