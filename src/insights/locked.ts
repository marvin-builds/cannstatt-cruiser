/**
 * The locked view: a password form for the admin token, savable by password managers, with
 * "Angemeldet bleiben" (ROADMAP 74: keep a 7-day board session on this device, never the token).
 */
import { h } from './dom';

export interface LockedView {
  /** Shown above the form, e.g. 'Token falsch'. */
  message: string | null;
  busy: boolean;
  /** Offers a retry with the token already in memory (after a network error). */
  canRetry: boolean;
  /** "Angemeldet bleiben" is ticked (kept across re-renders of this view, never stored). */
  remember: boolean;
}

export interface LockedHandlers {
  onSubmit(token: string, remember: boolean): void;
  onRetry(): void;
}

export function renderLocked(root: HTMLElement, view: LockedView, handlers: LockedHandlers): void {
  const token = h('input', { type: 'password', name: 'token', id: 'token', autocomplete: 'current-password', required: true, autofocus: true });
  const retry = view.canRetry ? h('button', { type: 'button', class: 'ghost' }, 'Nochmal versuchen') : null;
  retry?.addEventListener('click', handlers.onRetry);
  const remember = h('input', { type: 'checkbox', id: 'remember', name: 'remember', checked: view.remember });
  const form = h(
    'form',
    { class: 'lock card', 'aria-busy': String(view.busy) },
    h('h1', {}, 'Insights'),
    h('p', { class: 'card-note' }, 'Cannstatt Cruiser · nur für Admins'),
    // Lets password managers store the token under a fixed user name.
    h('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'insights', class: 'visually-hidden', tabindex: -1, 'aria-hidden': 'true', readonly: true }),
    h('label', { for: 'token' }, 'Admin-Token'),
    token,
    h(
      'label',
      { class: 'remember', for: 'remember' },
      remember,
      h('span', {}, 'Angemeldet bleiben', h('small', {}, '7 Tage auf diesem Gerät, ohne den Token zu speichern')),
    ),
    view.message ? h('p', { class: 'banner', role: 'alert' }, view.message, retry) : null,
    h('button', { type: 'submit', disabled: view.busy }, view.busy ? 'Lädt …' : 'Öffnen'),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (token.value.trim()) handlers.onSubmit(token.value, remember.checked);
  });
  root.replaceChildren(h('main', { class: 'locked' }, form));
  token.focus();
}
