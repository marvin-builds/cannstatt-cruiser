/** The two owner switches under the board header (ROADMAP 55): mark this device, include test devices. */
import { h } from './dom';

export interface DeviceSwitchesView {
  /** This device carries the test-device marker. */
  testDevice: boolean;
  /** The numbers include test devices. */
  testers: boolean;
  loading: boolean;
  /** How the last tester pass refresh went (ROADMAP 75), or null. */
  testerPassNote: string | null;
}

export interface DeviceSwitchesHandlers {
  onTestDevice(on: boolean): void;
  onTesters(on: boolean): void;
}

function toggle(id: string, label: string, checked: boolean, disabled: boolean, onChange: (on: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', role: 'switch', id, checked, disabled });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'switch', for: id }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' }), h('span', {}, label));
}

const NOTE_ID = 'tester-pass-note';

export function deviceSwitches(view: DeviceSwitchesView, handlers: DeviceSwitchesHandlers): HTMLElement {
  return h(
    'div',
    { class: 'switches', role: 'group', 'aria-label': 'Testgeräte' },
    toggle('switch-test-device', 'Dieses Gerät ist ein Testgerät', view.testDevice, false, handlers.onTestDevice),
    toggle('switch-testers', 'inkl. Testgeräte', view.testers, view.loading, handlers.onTesters),
    h('p', { class: 'switch-note', id: NOTE_ID, 'aria-live': 'polite', hidden: !view.testerPassNote }, view.testerPassNote ?? ''),
  );
}

/** Updates the tester pass note in place, so an open editor on the board is not re-rendered away. */
export function showTesterPassNote(root: HTMLElement, note: string | null): void {
  const element = root.querySelector<HTMLElement>(`#${NOTE_ID}`);
  if (!element) return;
  element.textContent = note ?? '';
  element.hidden = !note;
}
