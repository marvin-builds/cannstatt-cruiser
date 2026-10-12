/**
 * The HUD mission line (ROADMAP 52 point 11): a small plate right under the
 * stats plate with a bullseye, the running mission's goal ("3 Leute stompen")
 * and its progress ("1/3"), shown while state.mission is set. Where it would
 * cover the portrait item button (under a plate grown by timer rows) it steps
 * right of it. Its texts and plate are rebuilt only when the mission, its
 * progress, the language or the boxes around it change, so the HUD allocates
 * nothing per tick. screens.ts draws it; the popups and the stunt callout keep
 * clear of its plate.
 */
import { measureText } from '../core/font';
import type { Mission, MissionKind, Rect } from '../types';
import { type Lang, language, texts } from './i18n';
import { STATS_PAD } from './stats';

/** Bullseye width (MISSION_ICON) plus the gap before the goal text. */
export const MISSION_ICON_W = 7 + 3;
/** Gap between the mission plate and the stats plate above it (or a box it steps beside). */
const GAP = 2;
/** Gap between the goal text and the progress. */
const PROGRESS_GAP = 4;
/** Height of a text row (font line height). */
const TEXT_H = 8;
const PLATE_H = TEXT_H + 2 * STATS_PAD;

/** The goal of a `kind` mission in the active language: "3 Sterne sammeln", "Grind for 4 s". */
export function missionGoal(kind: MissionKind, goal: number): string {
  return texts().missions.goals[kind](goal);
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export class MissionLine {
  goal = '';
  progress = '';
  /** Left edge of the goal text, of the progress, and the top of the text row. */
  textX = 0;
  progressX = 0;
  y = 0;
  /** The mission plate as drawn now, or null without a mission. */
  plate: Rect | null = null;
  private readonly rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private kind: MissionKind | null = null;
  private goalN = -1;
  private progressN = -1;
  private lang: Lang | null = null;
  /** The stats plate and the box to keep clear of at the last layout (w 0: none). */
  private readonly under: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly avoid: Rect = { x: 0, y: 0, w: 0, h: 0 };

  /**
   * `under`: the stats plate as drawn now, the mission plate sits right below it, left-aligned;
   * `avoid`: a box it must not cover there (the portrait item button while it shows), or null.
   */
  update(mission: Mission | null, under: Rect, avoid: Rect | null = null): void {
    if (!mission) {
      this.plate = null;
      return;
    }
    const progress = Math.min(mission.progress, mission.goal);
    const lang = language();
    const textChanged = mission.kind !== this.kind || mission.goal !== this.goalN || lang !== this.lang;
    if (!textChanged && progress === this.progressN && sameRect(under, this.under) && sameRect(avoid ?? NONE, this.avoid)) {
      this.plate = this.rect;
      return;
    }
    if (textChanged) this.goal = missionGoal(mission.kind, mission.goal);
    this.progress = `${progress}/${mission.goal}`;
    Object.assign(this, { kind: mission.kind, goalN: mission.goal, progressN: progress, lang });
    Object.assign(this.under, under);
    Object.assign(this.avoid, avoid ?? NONE);
    const r = this.rect;
    r.x = under.x;
    r.y = under.y + under.h + GAP;
    r.w = STATS_PAD + MISSION_ICON_W + measureText(this.goal) + PROGRESS_GAP + measureText(this.progress) + STATS_PAD;
    r.h = PLATE_H;
    if (avoid && overlaps(r, avoid)) r.x = avoid.x + avoid.w + GAP;
    this.textX = r.x + STATS_PAD + MISSION_ICON_W;
    this.progressX = this.textX + measureText(this.goal) + PROGRESS_GAP;
    this.y = r.y + STATS_PAD;
    this.plate = r;
  }
}

const NONE: Rect = { x: 0, y: 0, w: 0, h: 0 };

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
