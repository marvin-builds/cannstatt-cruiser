/**
 * The ramp hint (ROADMAP 27, 40): ramps need a jump press, so while a kicker
 * approaches and while the skater rolls over it (inKickerHintRange: from
 * KICKER_HINT_LEAD seconds before the ramp to just after its lip, the
 * launch window and a little reading time before it), a small plate at the
 * hint spot under the skater says "Auf der Rampe springen! (Leertaste)"
 * (keyboard) or "Auf der Rampe tippen!" (touch), centred on the ramp under
 * the street (anchorX). It repeats for every kicker until the player has
 * launched off a ramp KICKER_HINT_LAUNCHES times (persisted as rampLaunches).
 * It disappears on `launch` and once the kicker has passed (the hint slot
 * lets it linger, hint-slot.ts).
 */
import { PLAYER_X } from '../core/config';
import type { Store } from '../core/storage';
import type { Entity, Rect } from '../types';
import { type HintRow, hintPlateRect } from './hint-plate';
import { popupScale } from './layout';

/** Launches off a ramp after which the hint has done its job for good. */
export const KICKER_HINT_LAUNCHES = 5;
/** Seconds before the feet reach the ramp that the hint appears (time to read it). */
export const KICKER_HINT_LEAD = 1.2;
/** Seconds after the feet left the ramp's end that it still shows (a press right after the lip still launches). */
export const KICKER_HINT_AFTER = 0.2;
const LAUNCHES_KEY = 'rampLaunches';

const DESKTOP_ROWS: readonly HintRow[] = [['Auf der Rampe springen!', '(Leertaste)']];
const TOUCH_ROWS: readonly HintRow[] = [['Auf der Rampe tippen!']];

/**
 * Whether the feet are close enough to the kicker for the hint: its front at
 * most KICKER_HINT_LEAD seconds ahead at `speed`, its end at most
 * KICKER_HINT_AFTER seconds behind.
 */
export function inKickerHintRange(kicker: Rect, speed: number): boolean {
  const v = Math.max(speed, 1);
  return kicker.x - PLAYER_X <= v * KICKER_HINT_LEAD && PLAYER_X - (kicker.x + kicker.w) <= v * KICKER_HINT_AFTER;
}

export class KickerHint {
  private launches: number;
  /** Id of the kicker the hint is about, or null. */
  private current: number | null = null;
  private launchedFrom: number | null = null;
  /** The kicker the hint was last about (its anchor), or null. */
  private target: number | null = null;
  /** Centre x of that kicker (where the plate is anchored); PLAYER_X before the first one. */
  anchorX = PLAYER_X;

  constructor(private readonly store: Store) {
    const stored = store.get<unknown>(LAUNCHES_KEY, 0);
    this.launches = typeof stored === 'number' ? stored : 0;
  }

  get visible(): boolean {
    return this.current !== null;
  }

  /** The player launched off ramps often enough: the hint never shows again. */
  get done(): boolean {
    return this.launches >= KICKER_HINT_LAUNCHES;
  }

  runStarted(): void {
    this.current = null;
  }

  /** The skater took off from a kicker: the hint has done its job for it; counts towards KICKER_HINT_LAUNCHES. */
  launched(): void {
    this.launchedFrom = this.current;
    this.current = null;
    if (this.done) return;
    this.launches++;
    this.store.set(LAUNCHES_KEY, this.launches);
  }

  /** Once per playing tick with state.entities and state.speed. */
  update(entities: readonly Entity[], speed: number): void {
    this.follow(entities);
    const ahead = this.done
      ? undefined
      : entities.find((e) => e.kind === 'kicker' && e.id !== this.launchedFrom && inKickerHintRange(e, speed));
    if (!ahead) {
      this.current = null;
      return;
    }
    this.current = ahead.id;
    this.target = ahead.id;
    this.follow(entities);
  }

  /** Moves the anchor with the target kicker while it is on the street. */
  private follow(entities: readonly Entity[]): void {
    if (this.target === null) return;
    const e = entities.find((x) => x.id === this.target);
    if (e) this.anchorX = e.x + e.w / 2;
  }
}

/** The plate's rows, font scale (as the other hints) and rect at the hint spot, centred on `anchorX` (the ramp). */
export function kickerHintPlate(
  display: { touch: boolean; portrait: boolean; viewWidth: number },
  anchorX = PLAYER_X,
): { rows: readonly HintRow[]; scale: number; rect: Rect } {
  const scale = popupScale(display, false);
  const rows = display.touch ? TOUCH_ROWS : DESKTOP_ROWS;
  return { rows, scale, rect: hintPlateRect(rows, scale, display.viewWidth, Math.round(anchorX)) };
}
