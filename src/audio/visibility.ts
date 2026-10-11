/** Page visibility for the audio system: browsers may stop audio while a tab is hidden. */

/** Calls `fn` each time the page becomes visible again; a no-op without a document. */
export function watchVisible(fn: () => void): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') fn();
  });
}
