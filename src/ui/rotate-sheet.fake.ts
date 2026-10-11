/** A test double of the rotate screen's DOM overlay (rotate-sheet.ts): whether it shows, and its "Trotzdem weiter". */
import type { RotateSheet, RotateSheetHandlers } from './rotate-sheet';

export function fakeRotateSheet() {
  const fake = {
    shown: false,
    actions: null as RotateSheetHandlers | null,
    factory: (handlers: RotateSheetHandlers): RotateSheet => {
      fake.actions = handlers;
      return { show: (shown) => void (fake.shown = shown) };
    },
  };
  return fake;
}
