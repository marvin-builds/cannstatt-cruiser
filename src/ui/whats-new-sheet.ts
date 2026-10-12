/**
 * "Neu in dieser Version" as a full-screen portrait sheet (ROADMAP 59): the
 * headline, the entries under their version headings in a list that scrolls
 * natively (touch drag, mouse wheel) or by the scroll keys (index.ts passes
 * them on: sheetScrollTo), a scroll bar like the canvas lists, and "Weiter".
 * Esc continues too. DOM-only (sheet-dom.ts); index.ts uses the WhatsNewSheet
 * interface, tests pass a fake.
 */
import type { ChangelogEntry } from '../types';
import { UI } from './art';
import { texts } from './i18n';
import { SHEET_STYLE, whatsNewSections } from './portrait-sheets';
import { createSheet, line, row, scrollPanel, SheetParts, sheetButton, styled, title } from './sheet-dom';
import { sheetScrollTo } from './whats-new';

export interface WhatsNewSheet {
  /** Shows the sheet with `entries` (the list starts at the top for new entries), or hides it for null. Called every tick. */
  show(entries: readonly ChangelogEntry[] | null): void;
  /** Scrolls the list for scroll key `code` and returns true; false for other keys. */
  scrollKey(code: string): boolean;
  /** The list's scroll position in CSS px while it shows (playtest hook), else null. */
  scroll(): { offset: number; maxScroll: number } | null;
}

export interface WhatsNewSheetHandlers {
  /** "Weiter" and Esc. */
  onDone(): void;
}

export function createDomWhatsNewSheet(handlers: WhatsNewSheetHandlers): WhatsNewSheet {
  const parts = new SheetParts(build);
  let shownEntries: readonly ChangelogEntry[] | null = null;

  function build() {
    const t = texts().menu;
    const sheet = createSheet(t.whatsNew, () => handlers.onDone());
    const { frame, list, placeThumb } = scrollPanel(t.whatsNew);
    const next = sheetButton(t.next, () => handlers.onDone());
    next.style.color = UI.yellow;
    sheet.root.style.overflowY = 'hidden';
    sheet.root.append(row(title(t.whatsNew)), frame, row(next));
    // A new build (another language) fills its list afresh.
    shownEntries = null;
    return { sheet, list, placeThumb };
  }

  /** The entries' headings and items, replacing what the list showed. */
  function fill(list: HTMLElement, entries: readonly ChangelogEntry[]): void {
    list.replaceChildren();
    for (const section of whatsNewSections(entries)) {
      const heading = styled(line(SHEET_STYLE.textPx, UI.yellow), { margin: '12px 0 4px', fontWeight: 'bold' });
      heading.textContent = section.heading.replace(/ (\d+\))$/, '\u00a0$1'); // "(Nr. 8)" never breaks
      const items = styled(document.createElement('ul'), { margin: '0', paddingLeft: '1.2em' });
      for (const text of section.items) {
        const item = styled(document.createElement('li'), { margin: '0 0 6px' });
        item.textContent = text;
        items.append(item);
      }
      list.append(heading, items);
    }
    list.scrollTop = 0;
  }

  return {
    show(entries) {
      if (!entries) {
        parts.built?.sheet.setShown(false);
        shownEntries = null;
        return;
      }
      const p = parts.get();
      p.sheet.setShown(true);
      if (entries !== shownEntries) {
        shownEntries = entries;
        fill(p.list, entries);
        p.placeThumb();
      }
    },
    scrollKey(code) {
      if (!parts.built || !shownEntries) return false;
      const { list } = parts.built;
      const lineH = parseFloat(getComputedStyle(list).lineHeight) || SHEET_STYLE.textPx;
      const to = sheetScrollTo(code, list.scrollTop, { max: list.scrollHeight - list.clientHeight, line: 2 * lineH, page: list.clientHeight });
      if (to === null) return false;
      list.scrollTop = to;
      return true;
    },
    scroll() {
      if (!parts.built || !shownEntries) return null;
      const { list } = parts.built;
      return { offset: list.scrollTop, maxScroll: list.scrollHeight - list.clientHeight };
    },
  };
}
