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
import { MENU_TEXT } from './menu-layout';
import { SHEET_STYLE, whatsNewSections } from './portrait-sheets';
import { scrollThumb } from './score-layout';
import { createSheet, line, row, sheetButton, styled, title } from './sheet-dom';
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

const BAR_W = 6;
/** The shortest thumb in CSS px. */
const THUMB_MIN = 24;

export function createDomWhatsNewSheet(handlers: WhatsNewSheetHandlers): WhatsNewSheet {
  let parts: ReturnType<typeof build> | null = null;
  let shownEntries: readonly ChangelogEntry[] | null = null;

  function build() {
    const sheet = createSheet(MENU_TEXT.whatsNew, () => handlers.onDone());
    const frame = styled(document.createElement('div'), { position: 'relative', flex: '1 1 auto', minHeight: '0', background: UI.panel, borderRadius: '3px' });
    const list = styled(document.createElement('div'), {
      height: '100%',
      boxSizing: 'border-box',
      padding: `4px ${SHEET_STYLE.padPx + BAR_W}px 8px ${SHEET_STYLE.padPx}px`,
      overflowY: 'auto',
      overscrollBehavior: 'contain',
      scrollbarWidth: 'none',
    });
    list.setAttribute('aria-label', MENU_TEXT.whatsNew);
    const track = styled(document.createElement('div'), { position: 'absolute', top: '6px', bottom: '6px', right: '6px', width: `${BAR_W}px`, background: UI.empty });
    const thumb = styled(document.createElement('div'), { position: 'absolute', left: '0', width: '100%', background: UI.muted });
    track.append(thumb);
    frame.append(list, track);
    const next = sheetButton(MENU_TEXT.next, () => handlers.onDone());
    next.style.color = UI.yellow;
    sheet.root.style.overflowY = 'hidden';
    sheet.root.append(row(title(MENU_TEXT.whatsNew)), frame, row(next));
    const placeThumb = () => {
      const t = scrollThumb(track.clientHeight, list.clientHeight, list.scrollHeight, list.scrollTop, THUMB_MIN);
      track.style.display = t ? 'block' : 'none';
      if (t) styled(thumb, { top: `${t.y}px`, height: `${t.h}px` });
    };
    list.addEventListener('scroll', placeThumb, { passive: true });
    new ResizeObserver(placeThumb).observe(list);
    return { sheet, list, placeThumb };
  }

  /** The entries' headings and items, replacing what the list showed. */
  function fill(list: HTMLElement, entries: readonly ChangelogEntry[]): void {
    list.replaceChildren();
    for (const section of whatsNewSections(entries)) {
      const heading = styled(line(SHEET_STYLE.textPx, UI.yellow), { margin: '12px 0 4px', fontWeight: 'bold' });
      heading.textContent = section.heading.replace('Nr. ', 'Nr.\u00a0'); // "(Nr. 8)" never breaks
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
        parts?.sheet.setShown(false);
        shownEntries = null;
        return;
      }
      parts ??= build();
      parts.sheet.setShown(true);
      if (entries !== shownEntries) {
        shownEntries = entries;
        fill(parts.list, entries);
        parts.placeThumb();
      }
    },
    scrollKey(code) {
      if (!parts || !shownEntries) return false;
      const { list } = parts;
      const lineH = parseFloat(getComputedStyle(list).lineHeight) || SHEET_STYLE.textPx;
      const to = sheetScrollTo(code, list.scrollTop, { max: list.scrollHeight - list.clientHeight, line: 2 * lineH, page: list.clientHeight });
      if (to === null) return false;
      list.scrollTop = to;
      return true;
    },
    scroll() {
      if (!parts || !shownEntries) return null;
      const { list } = parts;
      return { offset: list.scrollTop, maxScroll: list.scrollHeight - list.clientHeight };
    },
  };
}
