/**
 * How the UI shows the chill effect: the joint look for adults, a bubble-gum
 * look without any drug reference in kid mode (state.kidMode).
 */
import { UI } from './art';
import { texts } from './i18n';

export interface ChillLook {
  /** HUD timer icon: JOINT_ICON or GUM_ICON (art.ts). */
  icon: 'joint' | 'gum';
  /** "r, g, b" of the screen tint (alpha comes from the effect strength). */
  tint: string;
  /** "r, g, b" of the denser haze at the top and bottom edge. */
  edge: string;
  /** Colour of the draining timer bar. */
  bar: string;
  popupColor: string;
}

const ADULT: ChillLook = { icon: 'joint', tint: UI.chillTint, edge: UI.chillEdge, bar: UI.chillBar, popupColor: UI.orange };
const KID: ChillLook = { icon: 'gum', tint: UI.gumTint, edge: UI.gumEdge, bar: UI.pink, popupColor: UI.pink };

export function chillLook(kidMode: boolean): ChillLook {
  return kidMode ? KID : ADULT;
}

/** The popup at the pickup in the active language: no drug reference in kid mode. */
export function chillPopup(kidMode: boolean): string {
  const t = texts().chill;
  return kidMode ? t.kid : t.adult;
}
