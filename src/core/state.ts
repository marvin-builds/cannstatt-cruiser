import type { GameState, PlayerState } from '../types';
import { BASE_SPEED, GROUND_Y, MAX_HEALTH, PLAYER_X, START_ZONE } from './config';
import { createInstallState } from './install';

/** Default skater: standing on the ground at PLAYER_X with a 12x28 hitbox. */
export function createPlayer(): PlayerState {
  return {
    x: PLAYER_X,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    grounded: true,
    grinding: false,
    grindTrick: false,
    airTrick: false,
    state: 'ride',
    hitbox: { x: PLAYER_X - 6, y: GROUND_Y - 28, w: 12, h: 28 },
    invulnerableTimer: 0,
  };
}

export function createInitialState(): GameState {
  return {
    mode: 'title',
    modeTime: 0,
    time: 0,
    frame: 0,
    distance: 0,
    speed: BASE_SPEED,
    score: 0,
    combo: 0,
    multiplier: 1,
    stars: 0,
    chillTimer: 0,
    carriedItem: null,
    drunkTimer: 0,
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    zoneIndex: START_ZONE,
    trafficDensity: 0,
    park: null,
    muted: false,
    kidMode: true,
    updateReady: false,
    whatsNew: [],
    install: createInstallState(),
    seed: 0,
    player: createPlayer(),
    entities: [],
  };
}

/** Resets everything that belongs to a single run; keeps mode, frame, settings, the update flag, whatsNew and install. */
export function resetRun(state: GameState, seed: number): void {
  const fresh = createInitialState();
  Object.assign(state, {
    ...fresh,
    mode: state.mode,
    modeTime: state.modeTime,
    frame: state.frame,
    muted: state.muted,
    kidMode: state.kidMode,
    updateReady: state.updateReady,
    whatsNew: state.whatsNew,
    install: state.install,
    seed,
  });
}
