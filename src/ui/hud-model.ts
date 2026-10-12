/**
 * What the HUD stats plate shows, kept up to date once per tick without
 * allocating while nothing changes: the texts (score, stars, combo) are
 * rebuilt only when their number changes and the plate layout only when its
 * content width or rows change. screens.ts draws from it; the desktop item
 * chip's hotspot reads `chip`.
 */
import type { GameState, Rect } from '../types';
import { STAR } from './art';
import { drunkShown } from './drunk-look';
import { keycapChip } from './item-button';
import { formatNumber } from './layout';
import { texts, widestText } from './i18n';
import { NumberText } from './hud-text';
import { type StatsLayout, statsLayout } from './stats';

/** "Punkte" in its longest language, so the plate keeps its size across a switch. */
const LABEL_W = widestText((t) => t.hud.points);
/** Gap between the score and the multiplier / combo label. */
const COMBO_GAP = 6;
/** Hearts are 8 px apart; the star row starts this far right of the last one. */
export const HEART_STEP = 8;
export const STAR_GAP = 6;
export const STAR_TEXT_GAP = 3;

export class HudModel {
  readonly score = new NumberText(formatNumber, 2);
  readonly stars = new NumberText(formatNumber);
  readonly multiplier = new NumberText((m) => `x${m}`, 2);
  readonly comboLabel = new NumberText((c) => texts().hud.combo(String(c)));
  /** The multiplier shows (> 1); `comboLabel` too while the combo is > 1. */
  combo = false;
  showComboLabel = false;
  /** x of the multiplier and the combo label from the content's left: right of both the score and "Punkte". */
  comboX = 0;
  layout: StatsLayout = statsLayout(0, false);
  /** The desktop item chip next to the plate, or null while hidden. */
  chip: Rect | null = null;
  private readonly chipRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private contentW = 0;
  private chill = false;
  private drunk = false;
  private left = 0;

  /**
   * `withChip`: the desktop item chip shows (itemControl(...) === 'keycap'); `left`: the safe
   * span's left edge (safeSpan in layout.ts), right of a display cutout.
   */
  update(state: GameState, withChip = false, left = 0): void {
    this.score.update(state.score);
    this.stars.update(state.stars);
    this.combo = state.multiplier > 1;
    this.showComboLabel = this.combo && state.combo > 1;
    if (this.combo) this.multiplier.update(state.multiplier);
    if (this.showComboLabel) this.comboLabel.update(state.combo);

    this.comboX = Math.max(this.score.width, this.showComboLabel ? LABEL_W : 0) + COMBO_GAP;
    const scoreW = this.combo ? this.comboX + this.multiplier.width : this.score.width;
    const labelW = this.showComboLabel ? this.comboX + this.comboLabel.width : LABEL_W;
    const heartsW = state.maxHealth * HEART_STEP - 1;
    const rowW = heartsW + STAR_GAP + STAR.width + STAR_TEXT_GAP + this.stars.width;
    const contentW = Math.max(scoreW, labelW, rowW);
    const chill = state.chillTimer > 0;
    const drunk = drunkShown(state);
    if (contentW !== this.contentW || chill !== this.chill || drunk !== this.drunk || left !== this.left) {
      this.contentW = contentW;
      this.chill = chill;
      this.drunk = drunk;
      this.left = left;
      this.layout = statsLayout(contentW, chill, drunk, left);
      Object.assign(this.chipRect, keycapChip(this.layout.plate));
    }
    this.chip = withChip ? this.chipRect : null;
  }
}
