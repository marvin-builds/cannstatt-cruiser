/**
 * The tag of a fan crowd's people (ROADMAP 76, crowd.ts): `data.crowd` holds
 * the crowd's theme. Kept apart from crowd.ts (planning) so the item, art
 * and contact code can ask without importing the planner.
 */
import type { Entity } from '../types';

/** The entity data field that tags a fan of a crowd with its theme. */
export const CROWD_KEY = 'crowd';

export type CrowdTheme = 'vfb' | 'wasen';

/** The crowd a person belongs to, or null for everyone else. */
export function crowdOf(e: Pick<Entity, 'data'>): CrowdTheme | null {
  const c = e.data?.[CROWD_KEY];
  return c === 'vfb' || c === 'wasen' ? c : null;
}
