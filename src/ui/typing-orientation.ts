import { createOrientationLock, type OrientationEnv, type OrientationLock } from '../core/orientation';

/**
 * Portrait while the player types (ROADMAP 54): the feedback form or the name entry
 * frees the orientation lock, closing them locks landscape again. `free` says whether
 * portrait is really freed (the game holds the orientation and can lock it): then a
 * turn to portrait shows the form's portrait layout, not the rotate hint. In a plain
 * browser tab nothing changes.
 */
export class TypingOrientation {
  /** Portrait is freed now: the rotate hint stays away while the player types. */
  free = false;
  private readonly lock: OrientationLock | null;

  constructor(private readonly env: OrientationEnv | null) {
    this.lock = env ? createOrientationLock(env) : null;
  }

  /** Every tick, with whether a text form is open (only changes act). */
  update(typing: boolean): void {
    this.lock?.allowPortrait(typing);
    this.free = typing && !!this.env?.lock && this.env.locked();
  }
}
