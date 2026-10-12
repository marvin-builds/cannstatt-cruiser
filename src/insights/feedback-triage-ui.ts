/**
 * The ticket workflow of one feedback item (ROADMAP 83): the actions ticket-actions.ts offers for its state,
 * each opening one panel (one at a time). Umsetzen creates a GitHub issue or links an existing one and sets
 * Geplant with the player message in one worker request; Ablehnen, Abschließen, (Wieder) öffnen and
 * Antwort ändern patch status and message; Löschen asks first. Buttons are disabled while sending, and a
 * failure shows a short note in the item. Player text only ever goes in as text nodes and form values.
 * No <select>: every choice is a button, checkbox or radio (ROADMAP 81).
 */
import { BUILD_VERSION } from '../changelog';
import type { TriageResult, TriageUpdate } from './client';
import { h } from './dom';
import { logSummary } from './feedback';
import { formatDay } from './format';
import { doneMessage, NOT_PLANNED_MESSAGE, PLANNED_MESSAGE, rejectMessages, REOPEN_DONE_MESSAGE, REOPEN_REJECTED_MESSAGE } from './messages';
import { closeOutcome, reopenStatus, type TicketActionKind, ticketActions } from './ticket-actions';
import { issueBody, issueTitle, parseDoneVersion, parseIssueNumber, statusLabel, toggleLog, triageErrorText } from './triage';
import {
  MAX_ISSUE_ADDITION, MAX_ISSUE_BODY, MAX_ISSUE_TITLE, MAX_REPLY_CHARS, MIN_ISSUE_TITLE,
  type FeedbackTriage, type IssueDraft, type IssueLink, type TriagedFeedbackEntry, type TriagePatch,
} from './triage-types';

/** The worker calls; each resolves, never throws. */
export interface TriageActions {
  createIssue(id: number, draft: IssueDraft): Promise<TriageResult<{ issue: number }>>;
  linkIssue(id: number, link: IssueLink): Promise<TriageResult<{ issue: number } & Pick<FeedbackTriage, 'issueState' | 'issueClosedDay'>>>;
  patch(id: number, patch: TriagePatch): Promise<TriageResult<{ triage: TriageUpdate }>>;
  remove(id: number): Promise<TriageResult<object>>;
}

/** What the card does after a successful action: show the new triage fields, or drop the entry. */
export interface TriageOutcome {
  changed(id: number, triage: Partial<FeedbackTriage>): void;
  removed(id: number): void;
}

type Panel = (entry: TriagedFeedbackEntry, actions: TriageActions, outcome: TriageOutcome, close: () => void) => HTMLElement;

function field(label: string, control: HTMLElement): HTMLElement {
  return h('label', { class: 'fb-field' }, h('span', {}, label), control);
}

function buttonRow(primary: HTMLButtonElement, cancel: () => void): HTMLElement {
  const back = h('button', { type: 'button', class: 'ghost' }, 'Abbrechen');
  back.addEventListener('click', cancel);
  return h('div', { class: 'fb-buttons' }, primary, back);
}

const errorNote = () => h('p', { class: 'fb-error', role: 'alert' });

/** The one-line player message (at most MAX_REPLY_CHARS); a textarea so the whole text stays readable, line breaks become spaces. */
function messageInput(value: string): HTMLTextAreaElement {
  const input = h('textarea', { name: 'reply', rows: 2, maxlength: MAX_REPLY_CHARS, class: 'fb-message', placeholder: 'z. B. Kommt in der nächsten Version' });
  input.value = value;
  input.addEventListener('input', () => {
    if (input.value.includes('\n')) input.value = input.value.replace(/\n+/g, ' ');
  });
  return input;
}

const messageField = (input: HTMLTextAreaElement) =>
  field('Nachricht an den Spieler (er sieht sie im Spiel unter „Mein Feedback“; leer: keine)', input);

const replyOf = (input: HTMLTextAreaElement) => input.value.trim() || null;

/**
 * Runs `call` with the panel's enabled controls disabled; shows the failure in `note`, or hands the success on.
 * Controls that were disabled before (a hidden part of the form) stay disabled.
 */
async function submit<T>(panel: HTMLElement, note: HTMLElement, call: () => Promise<TriageResult<T>>, done: (result: T) => void): Promise<void> {
  const controls = [...panel.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('button, input, textarea')].filter((c) => !c.disabled);
  for (const c of controls) c.disabled = true;
  note.textContent = '';
  const result = await call();
  for (const c of controls) c.disabled = false;
  if (result.ok) done(result);
  else note.textContent = triageErrorText(result);
}

function form(label: string, ...children: (HTMLElement | null)[]): HTMLFormElement {
  return h('form', { class: 'fb-panel', 'aria-label': label }, ...children);
}

function issueNumberInput(): HTMLInputElement {
  return h('input', { type: 'text', name: 'issue', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', placeholder: 'z. B. 12 oder Link zum Issue' });
}

/** Reads the issue number field; on a bad value shows the hint and returns null. */
function readIssueNumber(input: HTMLInputElement, note: HTMLElement): number | null {
  const issue = parseIssueNumber(input.value);
  if (issue === null) {
    note.textContent = 'Issue-Nummer eingeben, z. B. 12 oder #12.';
    input.focus();
  }
  return issue;
}

/** Links an issue (POST /feedback/:id/link) and shows the ticket as Geplant with it. */
function sendLink(panel: HTMLElement, note: HTMLElement, entry: TriagedFeedbackEntry, actions: TriageActions, outcome: TriageOutcome, link: IssueLink): void {
  void submit(panel, note, () => actions.linkIssue(entry.id, link), ({ issue, issueState, issueClosedDay }) =>
    outcome.changed(entry.id, { status: 'todo', issue, reply: link.reply ?? null, doneVersion: null, issueState, issueClosedDay }));
}

/** Switches a part of the form on or off; the hidden part's controls are disabled so they are neither validated nor sent. */
function showPart(part: HTMLElement, on: boolean): void {
  part.hidden = !on;
  for (const c of part.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) c.disabled = !on;
}

/** Umsetzen: a new GitHub issue (title, text, log, developer addition) or an existing one, plus the player message; sets Geplant. */
const implementForm: Panel = (entry, actions, outcome, close) => {
  const note = errorNote();
  const title = h('input', { type: 'text', name: 'title', required: true, minlength: MIN_ISSUE_TITLE, maxlength: MAX_ISSUE_TITLE, autocomplete: 'off' });
  title.value = issueTitle(entry);
  const body = h('textarea', { name: 'body', rows: 9, required: true, maxlength: MAX_ISSUE_BODY, class: 'fb-code' });
  body.value = issueBody(entry, false);
  let withLog: HTMLElement | null = null;
  if (entry.log.length) {
    const box = h('input', { type: 'checkbox', name: 'log' });
    box.addEventListener('change', () => (body.value = toggleLog(body.value, entry.log, box.checked)));
    withLog = h('label', { class: 'fb-check' }, box, h('span', {}, `${logSummary(entry.log.length)} anhängen`));
  }
  const addition = h('textarea', { name: 'addition', rows: 4, maxlength: MAX_ISSUE_ADDITION, class: 'fb-code', placeholder: 'z. B. Idee zur Umsetzung, betroffene Stelle' });
  const newIssue = h(
    'div',
    { class: 'fb-group' },
    h('p', { class: 'fb-hint' }, 'Das Repo ist öffentlich: vorher alles Persönliche entfernen.'),
    field('Titel', title),
    field('Text', body),
    withLog,
    field('Ergänzung (Entwickler), optional: steht im Issue als eigener Abschnitt unter dem Spielertext', addition),
  );
  const number = issueNumberInput();
  const existing = h('div', { class: 'fb-group' }, field('Nummer des Issues (z. B. bei Duplikaten)', number));
  const linkSwitch = h('input', { type: 'checkbox', name: 'link', role: 'switch' });
  const switchRow = h('label', { class: 'switch' }, linkSwitch, h('span', { class: 'switch-track', 'aria-hidden': 'true' }), h('span', {}, 'Bestehendes Issue verknüpfen'));
  const message = messageInput(PLANNED_MESSAGE);
  const send = h('button', { type: 'submit' }, 'Issue anlegen');
  const linking = () => linkSwitch.checked;
  const update = () => {
    showPart(newIssue, !linking());
    showPart(existing, linking());
    send.textContent = linking() ? 'Verknüpfen' : 'Issue anlegen';
    note.textContent = '';
  };
  linkSwitch.addEventListener('change', update);
  update();
  const panel = form(
    'Umsetzen: GitHub-Issue anlegen oder verknüpfen',
    switchRow, newIssue, existing, messageField(message),
    h('p', { class: 'fb-hint' }, 'Speichern setzt den Status auf Geplant.'),
    buttonRow(send, close), note,
  );
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    const reply = replyOf(message);
    if (linking()) {
      const issue = readIssueNumber(number, note);
      if (issue !== null) sendLink(panel, note, entry, actions, outcome, { issue, reply });
      return;
    }
    const draft: IssueDraft = { title: title.value, body: body.value, reply };
    if (addition.value.trim()) draft.addition = addition.value;
    void submit(panel, note, () => actions.createIssue(entry.id, draft), ({ issue }) =>
      outcome.changed(entry.id, { status: 'todo', issue, reply, doneVersion: null, issueState: 'open', issueClosedDay: null }));
  });
  return panel;
};

/** Issue verknüpfen (Geplant without an issue, or with one GitHub no longer has): number and message; stays Geplant. */
const linkForm: Panel = (entry, actions, outcome, close) => {
  const note = errorNote();
  const number = issueNumberInput();
  const message = messageInput(entry.reply ?? PLANNED_MESSAGE);
  const panel = form(
    'Issue verknüpfen',
    entry.issue !== null ? h('p', { class: 'fb-hint' }, `Issue #${entry.issue} gibt es auf GitHub nicht mehr. Ein anderes verknüpfen:`) : null,
    field('Nummer des Issues', number),
    messageField(message),
    buttonRow(h('button', { type: 'submit' }, 'Verknüpfen'), close),
    note,
  );
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    const issue = readIssueNumber(number, note);
    if (issue !== null) sendLink(panel, note, entry, actions, outcome, { issue, reply: replyOf(message) });
  });
  return panel;
};

/** A status change with a message (Ablehnen, Abschließen, Öffnen): the patch is sent as given plus the message. */
function patchForm(label: string, entry: TriagedFeedbackEntry, actions: TriageActions, outcome: TriageOutcome, close: () => void, parts: {
  before?: (HTMLElement | null)[];
  message: HTMLTextAreaElement;
  button: string;
  /** The patch without the message, or null when a field is invalid (it shows its own note). */
  patch: (note: HTMLElement) => TriagePatch | null;
}): HTMLElement {
  const note = errorNote();
  const panel = form(label, ...(parts.before ?? []), messageField(parts.message), buttonRow(h('button', { type: 'submit' }, parts.button), close), note);
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    const patch = parts.patch(note);
    if (!patch) return;
    void submit(panel, note, () => actions.patch(entry.id, { ...patch, reply: replyOf(parts.message) }), ({ triage }) => outcome.changed(entry.id, triage));
  });
  return panel;
}

/** Ablehnen: pick one of the default texts (or write one); sets Abgelehnt. */
const rejectForm: Panel = (entry, actions, outcome, close) => {
  const choices = rejectMessages(entry.kind);
  const message = messageInput(choices[0]!);
  const name = `reject-${entry.id}`;
  const radios = choices.map((text, i) => {
    const radio = h('input', { type: 'radio', name, value: String(i), checked: i === 0 });
    radio.addEventListener('change', () => (message.value = text));
    return h('label', { class: 'fb-check' }, radio, h('span', {}, text));
  });
  const picker = h('fieldset', { class: 'fb-choices' }, h('legend', {}, 'Vorlage wählen'), ...radios);
  return patchForm('Ablehnen', entry, actions, outcome, close, { before: [picker], message, button: 'Ablehnen', patch: () => ({ status: 'rejected' }) });
};

/** Abschließen: an issue closed as done sets Erledigt with 'umgesetzt in Version' (BUILD_VERSION); one closed as not planned sets Abgelehnt. */
const completeForm: Panel = (entry, actions, outcome, close) => {
  const closedOn = entry.issueClosedDay ? ` am ${formatDay(entry.issueClosedDay)}` : '';
  if (closeOutcome(entry) === 'rejected') {
    return patchForm('Abschließen: Abgelehnt', entry, actions, outcome, close, {
      before: [h('p', { class: 'fb-hint' }, `Das Issue wurde auf GitHub${closedOn} verworfen. Abschließen setzt den Status auf Abgelehnt.`)],
      message: messageInput(NOT_PLANNED_MESSAGE),
      button: 'Als abgelehnt abschließen',
      patch: () => ({ status: 'rejected' }),
    });
  }
  const version = h('input', { type: 'text', name: 'doneVersion', autocomplete: 'off', spellcheck: 'false', maxlength: 13, placeholder: 'z. B. 2026-10-12.1' });
  version.value = BUILD_VERSION;
  const message = messageInput(doneMessage(BUILD_VERSION));
  // While the message is still the default, it follows the version.
  let shown = BUILD_VERSION;
  version.addEventListener('input', () => {
    const next = parseDoneVersion(version.value) ?? null;
    if (message.value === doneMessage(shown)) message.value = doneMessage(next);
    shown = next ?? '';
  });
  return patchForm('Abschließen: Erledigt', entry, actions, outcome, close, {
    before: [
      h('p', { class: 'fb-hint' }, `Das Issue ist auf GitHub${closedOn} erledigt. Abschließen setzt den Status auf Erledigt.`),
      field('Umgesetzt in Version (leer: ohne Version)', version),
    ],
    message,
    button: 'Als erledigt abschließen',
    patch: (note) => {
      const doneVersion = parseDoneVersion(version.value);
      if (doneVersion !== undefined) return { status: 'done', doneVersion };
      note.textContent = 'Version im Format JJJJ-MM-TT.n, z. B. 2026-10-12.1 (oder leer lassen).';
      version.focus();
      return null;
    },
  });
};

/** Wieder öffnen (Erledigt) and Öffnen (Abgelehnt): back to Geplant with an issue, else to Neu, with a fresh message. */
const reopenForm: Panel = (entry, actions, outcome, close) => {
  const target = reopenStatus(entry);
  const reopened = entry.status === 'done' && entry.issueState === 'open' ? ' Das Issue ist auf GitHub wieder offen.' : '';
  return patchForm(entry.status === 'done' ? 'Wieder öffnen' : 'Öffnen', entry, actions, outcome, close, {
    before: [h('p', { class: 'fb-hint' }, `Setzt den Status zurück auf ${statusLabel(target)}.${reopened}`)],
    message: messageInput(entry.status === 'done' ? REOPEN_DONE_MESSAGE : REOPEN_REJECTED_MESSAGE),
    button: `Zurück auf ${statusLabel(target)}`,
    patch: () => ({ status: target }),
  });
};

/** Antwort ändern: only the message; the status stays. */
const replyForm: Panel = (entry, actions, outcome, close) =>
  patchForm('Antwort ändern', entry, actions, outcome, close, { message: messageInput(entry.reply ?? ''), button: 'Speichern', patch: () => ({}) });

const deleteConfirm: Panel = (entry, actions, outcome, close) => {
  const note = errorNote();
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
};

const PANELS: Record<TicketActionKind, Panel> = {
  implement: implementForm, reject: rejectForm, complete: completeForm, link: linkForm, reopen: reopenForm, reply: replyForm, delete: deleteConfirm,
};

/** The action buttons of the ticket's state and the place where their panel opens. */
export function triageControls(entry: TriagedFeedbackEntry, actions: TriageActions, outcome: TriageOutcome): HTMLElement {
  const slot = h('div', { class: 'fb-slot' });
  const bar = h('div', { class: 'fb-actions' });
  const buttons: HTMLButtonElement[] = [];
  let open: TicketActionKind | null = null;
  const close = () => {
    open = null;
    slot.replaceChildren();
    for (const b of buttons) b.setAttribute('aria-expanded', 'false');
  };
  for (const { kind, label, disabledReason } of ticketActions(entry)) {
    const whyId = disabledReason ? `fb-why-${entry.id}-${kind}` : undefined;
    const button = h(
      'button',
      { type: 'button', class: kind === 'delete' ? 'ghost small danger-text' : 'ghost small', 'aria-expanded': 'false', disabled: !!disabledReason, 'aria-describedby': whyId },
      label,
    );
    button.addEventListener('click', () => {
      if (open === kind) return close();
      close();
      open = kind;
      button.setAttribute('aria-expanded', 'true');
      const panel = PANELS[kind](entry, actions, outcome, close);
      slot.replaceChildren(panel);
      panel.querySelector<HTMLElement>('input:not([type=radio]):not([type=checkbox]):not(:disabled), textarea:not(:disabled), button')?.focus();
    });
    buttons.push(button);
    bar.append(disabledReason ? h('span', { class: 'fb-waiting' }, button, h('span', { class: 'fb-why', id: whyId! }, disabledReason)) : button);
  }
  return h('div', { class: 'fb-triage' }, bar, slot);
}
