type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };

export function isFullscreen(): boolean {
  const doc = document as FsDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/** True when the browser offers a Fullscreen API (iPhone Safari does not). */
export function fullscreenSupported(): boolean {
  const el = document.documentElement as FsElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

/**
 * Enters or leaves fullscreen; must run inside a user gesture. Without the API
 * (iOS Safari) the page already fills the viewport, so it falls back to doing
 * nothing beyond scrolling the URL bar away; "Add to Home Screen" gives true fullscreen.
 */
export function toggleFullscreen(): void {
  const doc = document as FsDocument;
  const el = document.documentElement as FsElement;
  try {
    if (isFullscreen()) {
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      return;
    }
    if (!fullscreenSupported()) {
      window.scrollTo(0, 1);
      return;
    }
    const request = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
    void Promise.resolve(request)
      .then(() => lockLandscape())
      .catch(() => {});
  } catch {
    // Fullscreen refused (not a gesture, iframe policy): keep playing windowed.
  }
}

function lockLandscape(): void {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  orientation?.lock?.('landscape').catch(() => {});
}
