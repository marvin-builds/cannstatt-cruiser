export type GameMode = 'title' | 'playing' | 'paused' | 'gameover';
export type ModeCommand = 'start' | 'pause' | 'resume' | 'die' | 'toTitle';

const TRANSITIONS: Record<GameMode, Partial<Record<ModeCommand, GameMode>>> = {
  title: { start: 'playing' },
  playing: { pause: 'paused', die: 'gameover' },
  paused: { resume: 'playing', toTitle: 'title' },
  gameover: { start: 'playing', toTitle: 'title' },
};

/** The mode a command leads to, or null when the command is not valid in `mode`. */
export function nextMode(mode: GameMode, command: ModeCommand): GameMode | null {
  return TRANSITIONS[mode][command] ?? null;
}
