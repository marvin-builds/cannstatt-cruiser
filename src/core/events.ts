export type Listener<P> = (payload: P) => void;
export type AnyListener<E> = <K extends keyof E>(name: K, payload: E[K]) => void;

/** Minimal synchronous, typed pub/sub. `E` maps event names to payload types. */
export class EventBus<E> {
  private readonly listeners = new Map<keyof E, Set<Listener<never>>>();
  private readonly anyListeners = new Set<AnyListener<E>>();

  on<K extends keyof E>(name: K, fn: Listener<E[K]>): () => void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(fn as Listener<never>);
    return () => set.delete(fn as Listener<never>);
  }

  /** Listens to every event (used by the test hook's event log). */
  onAny(fn: AnyListener<E>): () => void {
    this.anyListeners.add(fn);
    return () => this.anyListeners.delete(fn);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const set = this.listeners.get(name);
    if (set) for (const fn of [...set]) (fn as Listener<E[K]>)(payload);
    for (const fn of [...this.anyListeners]) fn(name, payload);
  }
}
