/**
 * Turns one tick's gameplay events into popups. Events that belong together
 * arrive in the same tick (gameplay emits them back to back), so the feed
 * collects them and the ui flushes once per tick: a stomp and the points of
 * the same person become one "Stomp! +150", a ball hit and its points one
 * "Treffer! +200". Every text is German; kid mode never mentions beer.
 * A full kickflip gets the big stunt callout instead (stunt-callout.ts); a
 * reduced one (ROADMAP 41) only a plain popup here. A star (ROADMAP 65)
 * shows "Stern!" with the points of the score change gameplay emits right
 * after it, and an arc bonus right after those its own "Sternenbogen!"
 * (gameplay/star-arcs.ts); the pool sums star points of quick repeats.
 * A fan crowd coming on screen (ROADMAP 76) shows "VfB-Fans!" or "Wasen!".
 */
import { STAR_ARC_BONUS } from '../gameplay/star-arcs';
import type { CrowdTheme } from '../gameplay/crowd-tag';
import type { GameState, ItemAction } from '../types';
import { UI } from './art';
import { plusPoints } from './layout';

export interface PopupSpec {
  text: string;
  color: string;
  /** Small icon drawn after the text. */
  icon: 'heart' | null;
  /** Points drawn after the text, summed when it merges with a live repeat (PopupPool); absent: none. */
  points?: number;
}

/**
 * What a kickflip bail (crash kind 'bail') is blamed on: a plain late flip (ROADMAP 41), or the
 * drunk or chill effect that made it more likely (ROADMAP 42). Kid-safe words either way.
 */
export type BailCause = 'late' | 'wobbly' | 'relaxed';

const BAIL_TEXT: Record<BailCause, string> = { late: 'Zu spät geflippt!', wobbly: 'Zu wacklig!', relaxed: 'Zu entspannt!' };

/** The cause of a bail from the state at the moment it happens: drunk before chilled before late. */
export function bailCause(state: Pick<GameState, 'drunkTimer' | 'chillTimer'>): BailCause {
  if (state.drunkTimer > 0) return 'wobbly';
  return state.chillTimer > 0 ? 'relaxed' : 'late';
}

type Entry =
  | { kind: 'cleared'; entityId: number; points: number }
  | { kind: 'stomp' | 'ballHit'; entityId: number }
  | { kind: 'used'; action: ItemAction }
  | { kind: 'score'; delta: number; multiplier: number }
  | { kind: 'star' }
  | { kind: 'healthGained' | 'ballBack' }
  | { kind: 'crash'; bail: BailCause | null }
  | { kind: 'grindTrick' | 'highFive' | 'reducedKickflip'; points: number }
  | { kind: 'crowd'; theme: CrowdTheme };

/** A fan crowd ahead (ROADMAP 76): who blocks the street. */
const CROWD_TEXT: Record<CrowdTheme, string> = { vfb: 'VfB-Fans!', wasen: 'Wasen!' };

/** Events that take the points of a clear of the same entity into their own popup. */
const MERGED = { stomp: ['Stomp!', UI.orange], ballHit: ['Treffer!', UI.yellow] } as const;

const NONE: readonly PopupSpec[] = [];

export class PopupFeed {
  private entries: Entry[] = [];

  /** Drops everything collected (a new run starts). */
  clear(): void {
    this.entries = [];
  }

  cleared(entityId: number, points: number): void {
    this.entries.push({ kind: 'cleared', entityId, points });
  }

  stomp(entityId: number): void {
    this.entries.push({ kind: 'stomp', entityId });
  }

  ballHit(entityId: number): void {
    this.entries.push({ kind: 'ballHit', entityId });
  }

  itemUsed(action: ItemAction): void {
    this.entries.push({ kind: 'used', action });
  }

  healthGained(): void {
    this.entries.push({ kind: 'healthGained' });
  }

  scoreChanged(delta: number, multiplier: number): void {
    this.entries.push({ kind: 'score', delta, multiplier });
  }

  star(): void {
    this.entries.push({ kind: 'star' });
  }

  ballBack(): void {
    this.entries.push({ kind: 'ballBack' });
  }

  /** The skater crashed; `bail` names the cause when a kickflip was still turning on the landing (ROADMAP 41/42). */
  crash(bail: BailCause | null = null): void {
    this.entries.push({ kind: 'crash', bail });
  }

  /** A kickflip whose points were cut (airTrick with full false). */
  reducedKickflip(points: number): void {
    this.entries.push({ kind: 'reducedKickflip', points });
  }

  grindTrick(points: number): void {
    this.entries.push({ kind: 'grindTrick', points });
  }

  highFive(points: number): void {
    this.entries.push({ kind: 'highFive', points });
  }

  /** A fan crowd came on screen (crowdAhead). */
  crowdAhead(theme: CrowdTheme): void {
    this.entries.push({ kind: 'crowd', theme });
  }

  /** The popups for everything since the last flush, in event order; then starts over. */
  flush(kidMode: boolean): readonly PopupSpec[] {
    const entries = this.entries;
    if (entries.length === 0) return NONE;
    this.entries = [];
    const out: PopupSpec[] = [];
    const add = (text: string, color: string, icon: PopupSpec['icon'] = null) => out.push({ text, color, icon });
    entries.forEach((e, i) => {
      switch (e.kind) {
        case 'cleared': {
          const merge = entries.find((m) => (m.kind === 'stomp' || m.kind === 'ballHit') && m.entityId === e.entityId);
          if (merge) {
            const [text, color] = MERGED[merge.kind as keyof typeof MERGED];
            add(`${text} ${plusPoints(e.points)}`, color);
          } else add(plusPoints(e.points), UI.white);
          break;
        }
        case 'stomp':
        case 'ballHit':
          if (!entries.some((c) => c.kind === 'cleared' && c.entityId === e.entityId)) add(MERGED[e.kind][0], MERGED[e.kind][1]);
          break;
        case 'used':
          if (e.action === 'throw') add('Wurf!', UI.white);
          else if (e.action === 'drink' && !kidMode) add('Gluck gluck gluck!', UI.yellow);
          else if (entries.some((h) => h.kind === 'healthGained')) add('Lecker! +1', UI.pink, 'heart');
          // Gameplay scores the bonus right after itemUsed; the score before it may belong to a clear.
          else add(`Lecker! ${bonus(entries[i + 1]) ?? bonus(entries[i - 1]) ?? '+Punkte'}`, UI.pink);
          break;
        case 'ballBack':
          add('Achtung, der Ball!', UI.red);
          break;
        case 'crash':
          add(e.bail ? BAIL_TEXT[e.bail] : 'Autsch!', UI.red);
          break;
        case 'grindTrick':
          add(`Boardslide! ${plusPoints(e.points)}`, UI.teal);
          break;
        case 'highFive':
          add(`High Five! ${plusPoints(e.points)}`, UI.yellow);
          break;
        case 'reducedKickflip':
          add(`Kickflip ${plusPoints(e.points)}`, UI.palePink);
          break;
        case 'star':
          addStar(out, entries[i + 1], entries[i + 2]);
          break;
        case 'crowd':
          add(CROWD_TEXT[e.theme], e.theme === 'vfb' ? UI.white : UI.orange);
          break;
      }
    });
    return out;
  }
}

/** The bonus points of a score change right next to an eat (full health). */
function bonus(e: Entry | undefined): string | null {
  return e?.kind === 'score' && e.delta > 0 ? plusPoints(e.delta) : null;
}

/** "Stern!" with the points of the star's score change (`own`), and "Sternenbogen!" when the arc bonus follows it (`next`). */
function addStar(out: PopupSpec[], own: Entry | undefined, next: Entry | undefined): void {
  const points = own?.kind === 'score' ? own.delta : 0;
  out.push(points > 0 ? { text: 'Stern!', color: UI.yellow, icon: null, points } : { text: 'Stern!', color: UI.yellow, icon: null });
  if (own?.kind === 'score' && next?.kind === 'score' && next.delta === STAR_ARC_BONUS * next.multiplier) {
    out.push({ text: 'Sternenbogen!', color: UI.orange, icon: null, points: next.delta });
  }
}
