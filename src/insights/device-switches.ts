/** The two owner switches under the board header (ROADMAP 55): mark this device, include test devices. */
import { h } from './dom';

export interface DeviceSwitchesView {
  /** This device carries the test-device marker. */
  testDevice: boolean;
  /** The numbers include test devices. */
  testers: boolean;
  loading: boolean;
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

export function deviceSwitches(view: DeviceSwitchesView, handlers: DeviceSwitchesHandlers): HTMLElement {
  return h(
    'div',
    { class: 'switches', role: 'group', 'aria-label': 'Testgeräte' },
    toggle('switch-test-device', 'Dieses Gerät ist ein Testgerät', view.testDevice, false, handlers.onTestDevice),
    toggle('switch-testers', 'inkl. Testgeräte', view.testers, view.loading, handlers.onTesters),
  );
}
