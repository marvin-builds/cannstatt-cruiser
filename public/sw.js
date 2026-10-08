/*
 * Service worker for offline play. Paths are relative to the worker's scope,
 * so the build works under any sub-path (GitHub Pages).
 *
 * - install: caches the app shell, i.e. the page plus every same-origin
 *   script / style / icon it references (Vite's hashed assets included).
 * - fetch: the page is served from the cache at once and refreshed in the
 *   background. A changed page (a new deploy) replaces the cached one only
 *   after all of its assets are cached, so an offline start always finds a
 *   complete build; assets only the old page referenced are then dropped.
 *   All other same-origin GETs are cache-first and cached on first use.
 * - activate: deletes caches of older versions.
 * - update signal: once a changed page is completely cached (a new deploy, or
 *   a new worker version that cached a different page than its predecessor),
 *   every open window gets the message {type: 'updateReady'} (handled in
 *   src/core/update.ts). Never on the first install.
 *
 * Bump VERSION only when this file's caching logic changes; new game builds
 * are picked up by the background page refresh.
 */
const VERSION = 'v2';
const PREFIX = 'cannstatt-cruiser-';
const CACHE = PREFIX + VERSION;
const SHELL_URL = new URL('./', self.registration.scope).href;
const STATIC_FILES = ['./manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'].map(
  (f) => new URL(f, SHELL_URL).href,
);
/** Servers may send `Vary: Origin` (module scripts are CORS requests); cached files match regardless. */
const MATCH = { ignoreSearch: true, ignoreVary: true };

const UPDATE_READY = { type: 'updateReady' };

/** Tells every open window that a reload would start a newer, fully cached build. */
async function notifyUpdateReady() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage(UPDATE_READY);
}

/** Same-origin URLs referenced by src/href attributes in the page. */
function referencedAssets(html) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(match[1], SHELL_URL);
    if (url.origin === self.location.origin && url.href !== SHELL_URL) urls.add(url.href);
  }
  return [...urls];
}

/**
 * Stores `response` as the app shell if it differs from the cached page:
 * caches its missing assets first (all or nothing, so a failed download keeps
 * the old, complete build), then the page, then drops assets that only the
 * old page referenced. Replacing an earlier page signals an update.
 */
async function storePage(cache, response) {
  const html = await response.clone().text();
  const cached = await cache.match(SHELL_URL, MATCH);
  const oldHtml = cached ? await cached.text() : null;
  if (html === oldHtml) return;
  const assets = new Set([...STATIC_FILES, ...referencedAssets(html)]);
  const missing = [];
  for (const url of assets) if (!(await cache.match(url, MATCH))) missing.push(url);
  await cache.addAll(missing);
  await cache.put(SHELL_URL, response);
  if (oldHtml === null) return;
  for (const url of referencedAssets(oldHtml)) if (!assets.has(url)) await cache.delete(url, MATCH);
  await notifyUpdateReady();
}

/** The cached app shell's HTML in cache `name`, or null. */
async function cachedPage(name) {
  const page = await (await caches.open(name)).match(SHELL_URL, MATCH);
  return page ? page.text() : null;
}

/**
 * Deletes the caches of older worker versions. If one of them held a different
 * page, the open windows run an older build than the one just cached.
 */
async function dropOldCaches() {
  const old = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== CACHE);
  const current = await cachedPage(CACHE);
  let changed = false;
  for (const name of old) {
    const html = await cachedPage(name);
    if (html !== null && html !== current) changed = true;
    await caches.delete(name);
  }
  if (changed) await notifyUpdateReady();
}

async function cacheShell() {
  const page = await fetch(SHELL_URL, { cache: 'reload' });
  if (!page.ok) throw new Error(`App shell fetch failed: ${page.status}`);
  await storePage(await caches.open(CACHE), page);
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(dropOldCaches().then(() => self.clients.claim()));
});

async function fromCacheThenRefreshPage(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(SHELL_URL, MATCH);
  const network = fetch(event.request).catch(() => null);
  if (!cached) return (await network) ?? Response.error();
  event.waitUntil(
    network
      .then((response) => response?.ok && storePage(cache, response))
      .catch(() => {
        // Offline or a partial deploy: keep the cached build.
      }),
  );
  return cached;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, MATCH);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(fromCacheThenRefreshPage(event));
  else event.respondWith(cacheFirst(request));
});
