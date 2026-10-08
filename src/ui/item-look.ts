/**
 * The popup when the skater catches a tossed item (itemCaught). Kid mode
 * never cheers with beer: kid mode has no Maßkrug anyway (gameplay gives a
 * Lebkuchenherz), and should one arrive it is announced as a Brezel.
 */
import type { CarriedItem } from '../types';
import { UI } from './art';

export interface CatchPopup {
  text: string;
  color: string;
}

const POPUPS: Record<CarriedItem, CatchPopup> = {
  football: { text: 'Ball geschnappt!', color: UI.white },
  pretzel: { text: 'Brezel!', color: UI.orange },
  beer: { text: 'Prost!', color: UI.yellow },
  gingerbread: { text: 'Lebkuchenherz!', color: UI.pink },
};

export function catchPopup(item: CarriedItem, kidMode: boolean): CatchPopup {
  return POPUPS[kidMode && item === 'beer' ? 'pretzel' : item];
}
