/**
 * Turns one tick's gameplay events into popups. Events that belong together
 * arrive in the same tick (gameplay emits them back to back), so the feed
 * collects them and the ui flushes once per tick: a stomp and the points of
 * the same person become one "Stomp! +150", a ball hit and its points one
 * "Treffer! +200". Every text is German; kid mode never mentions beer.
 */
import type { ItemAction } from '../types';
import { UI } from './art';
import { plusPoints } from './layout';

export interface PopupSpec {
  text: string;
  color: string;
  /** Small icon drawn after the text. */
  icon: 'heart' | null;
}

type Entry =
  | { kind: 'cleared'; entityId: number; points: number }
  | { kind: 'stomp' | 'ballHit'; entityId: number }
  | { kind: 'used'; action: ItemAction }
  | { kind: 'score'; delta: number }
  | { kind: 'healthGained' | 'ballBack' | 'crash' }
  | { kind: 'grindTrick'; points: number };

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

  scoreChanged(delta: number): void {
    this.entries.push({ kind: 'score', delta });
  }

  ballBack(): void {
    this.entries.push({ kind: 'ballBack' });
  }

  crash(): void {
    this.entries.push({ kind: 'crash' });
  }

  grindTrick(points: number): void {
    this.entries.push({ kind: 'grindTrick', points });
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
          else if (e.action === 'drink' && !kidMode) add('Prost! Gluck gluck gluck', UI.yellow);
          else if (entries.some((h) => h.kind === 'healthGained')) add('Lecker! +1', UI.pink, 'heart');
          else add(`Lecker! ${bonus(entries[i - 1]) ?? bonus(entries[i + 1]) ?? '+Punkte'}`, UI.pink);
          break;
        case 'ballBack':
          add('Achtung, der Ball!', UI.red);
          break;
        case 'crash':
          add('Autsch!', UI.red);
          break;
        case 'grindTrick':
          add(`Grind-Trick! ${plusPoints(e.points)}`, UI.teal);
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
