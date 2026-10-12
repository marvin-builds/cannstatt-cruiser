import { createOrientationLock, type OrientationEnv, type OrientationLock } from '../core/orientation';

/**
 * Portrait while the player types (ROADMAP 54): the feedback form or the name entry
 * frees the orientation lock of the installed app, closing them locks landscape again.
 * In a plain browser tab nothing changes. Whether the rotate screen shows is
 * rotate-screen.ts's rule, not this lock's.
 */
export class TypingOrientation {
  private readonly lock: OrientationLock | null;

  constructor(private readonly env: OrientationEnv | null) {
    this.lock = env ? createOrientationLock(env) : null;
  }

  /** Closing a form locks landscape again now (an installed app or fullscreen that can lock). */
  turnsToLandscape(): boolean {
    return !!this.env?.lock && this.env.locked();
  }

  /** Every tick, with whether a text form is open (only changes act). */
  update(typing: boolean): void {
    this.lock?.allowPortrait(typing);
  }
}
