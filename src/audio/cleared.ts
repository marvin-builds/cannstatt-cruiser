/**
 * Decides which `obstacleCleared` events get the 'cleared' sound. A ball hit
 * or stomp also clears its person in the same tick and brings its own sounds,
 * so a clear of the same entity in that tick stays silent, whichever event
 * comes first. Clears are therefore held until `flush` at the end of the tick.
 */
export class ClearedSounds {
  /** Entity ids cleared this tick that still wait for their sound. */
  private readonly pending = new Set<number>();
  /** Entity ids that a ball hit or stomp already voiced, and the tick they belong to. */
  private readonly voiced = new Set<number>();
  private voicedFrame = -1;

  /** An obstacle was cleared on tick `frame`. */
  cleared(entityId: number, frame: number): void {
    if (this.voicedFrame === frame && this.voiced.has(entityId)) return;
    this.pending.add(entityId);
  }

  /** A ball hit or stomp on tick `frame` plays its own sound for this entity. */
  voicedBy(entityId: number, frame: number): void {
    if (this.voicedFrame !== frame) {
      this.voiced.clear();
      this.voicedFrame = frame;
    }
    this.voiced.add(entityId);
    this.pending.delete(entityId);
  }

  /** End of the tick: the number of 'cleared' sounds to play now. */
  flush(): number {
    const count = this.pending.size;
    this.pending.clear();
    return count;
  }

  /** New run: forget everything still waiting. */
  reset(): void {
    this.pending.clear();
    this.voiced.clear();
    this.voicedFrame = -1;
  }
}
