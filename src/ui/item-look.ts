/**
 * The popup when the skater catches a tossed item (itemCaught). Kid mode
 * never cheers with beer: kid mode has no Maßkrug anyway (gameplay gives a
 * Lebkuchenherz), and should one arrive it is announced as a Brezel.
 */
import type { CarriedItem } from '../types';
import { UI } from './art';
import { texts } from './i18n';

export interface CatchPopup {
  text: string;
  color: string;
}

const COLORS: Record<CarriedItem, string> = { football: UI.white, pretzel: UI.orange, beer: UI.yellow, gingerbread: UI.pink };

/** The catch popup in the active language (texts in i18n/ items). */
export function catchPopup(item: CarriedItem, kidMode: boolean): CatchPopup {
  const shown = kidMode && item === 'beer' ? 'pretzel' : item;
  return { text: texts().items[shown], color: COLORS[shown] };
}
