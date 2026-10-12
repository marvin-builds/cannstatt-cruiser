/**
 * Announces fan crowds (ROADMAP 76): the tick a crowd's first fan (seat 0)
 * comes on screen, `crowdAhead` tells the ui ("VfB-Fans!" / "Wasen!") and
 * audio (a chant) which crowd blocks the street ahead. Once per crowd.
 */
import type { GameContext } from '../types';
import { crowdOf } from './crowd-tag';
import { isLive } from './contacts';

export class CrowdWatch {
  /** Ids of the first fans already announced this run. */
  private readonly announced = new Set<number>();

  reset(): void {
    this.announced.clear();
  }

  update(ctx: GameContext): void {
    const { entities } = ctx.state;
    const right = ctx.display.viewWidth;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      if (e.x >= right || !isLive(e) || e.data?.seat !== 0 || this.announced.has(e.id)) continue;
      const theme = crowdOf(e);
      if (!theme) continue;
      this.announced.add(e.id);
      ctx.bus.emit('crowdAhead', { theme });
    }
  }
}
