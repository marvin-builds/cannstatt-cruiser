/**
 * Tests for public/sw.js (the worker is plain JS outside src/, so it lives
 * here): the script runs as a function body whose globals are in-memory
 * fakes for the cache storage, the network and the window clients.
 */
import { describe, expect, it } from 'vitest';
import SW_SOURCE from '../../public/sw.js?raw';

const SCOPE = 'https://game.test/app/';
const STATIC = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const page = (bundle: string) => `<html><script type="module" src="./assets/${bundle}"></script></html>`;

class FakeCache {
  readonly entries = new Map<string, string>();
  constructor(private readonly net: (url: string) => Promise<Response>) {}
  async match(url: string) {
    const body = this.entries.get(url.split('?')[0]!);
    return body === undefined ? undefined : new Response(body);
  }
  async put(url: string, response: Response) {
    this.entries.set(url, await response.text());
  }
  async addAll(urls: string[]) {
    const responses = await Promise.all(urls.map((u) => this.net(u)));
    if (responses.some((r) => !r.ok)) throw new TypeError('addAll: a request failed');
    await Promise.all(urls.map((u, i) => this.put(u, responses[i]!)));
  }
  async delete(url: string) {
    return this.entries.delete(url);
  }
}

/** One browser profile: network files, cache storage and open windows, shared by worker versions. */
function createBrowser(files: Record<string, string>) {
  const network = new Map(Object.entries(files).map(([path, body]) => [SCOPE + path, body]));
  const fetchUrl = async (url: string) => {
    const body = network.get(url.split('?')[0]!);
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
  };
  const stores = new Map<string, FakeCache>();
  const messages: unknown[] = [];
  const net = { offline: false };
  const caches = {
    open: async (name: string) => stores.get(name) ?? stores.set(name, new FakeCache(fetchUrl)).get(name)!,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };

  /** Loads sw.js as a fresh worker and returns its lifecycle drivers. */
  function startWorker() {
    const handlers = new Map<string, (event: unknown) => void>();
    const self = {
      registration: { scope: SCOPE },
      location: { origin: new URL(SCOPE).origin },
      addEventListener: (type: string, fn: (event: unknown) => void) => handlers.set(type, fn),
      skipWaiting: async () => {},
      clients: {
        claim: async () => {},
        matchAll: async () => [{ postMessage: (m: unknown) => messages.push(m) }],
      },
    };
    const fetch = async (input: string | { url: string }) => {
      if (net.offline) throw new TypeError('Failed to fetch');
      return fetchUrl(typeof input === 'string' ? input : input.url);
    };
    new Function('self', 'caches', 'fetch', SW_SOURCE)(self, caches, fetch);
    const dispatch = async (type: string, extra: object = {}) => {
      const pending: Promise<unknown>[] = [];
      let response: Promise<unknown> | undefined;
      handlers.get(type)!({
        ...extra,
        waitUntil: (p: Promise<unknown>) => pending.push(p),
        respondWith: (p: Promise<unknown>) => (response = p),
      });
      await response;
      await Promise.all(pending);
    };
    return {
      install: () => dispatch('install'),
      activate: () => dispatch('activate'),
      /** A page load: served from the cache, refreshed in the background. */
      navigate: () => dispatch('fetch', { request: { method: 'GET', url: SCOPE, mode: 'navigate' } }),
      /** A window posts a message to the worker. */
      message: (data: unknown) => dispatch('message', { data }),
    };
  }

  return { network, stores, messages, net, startWorker };
}

function staticFiles(): Record<string, string> {
  return Object.fromEntries(STATIC.map((f) => [f, f]));
}

async function installedBrowser() {
  const browser = createBrowser({ ...staticFiles(), '': page('index-old.js'), 'assets/index-old.js': 'old' });
  const worker = browser.startWorker();
  await worker.install();
  await worker.activate();
  return { ...browser, worker };
}

/** A cache left by an older worker version, holding `html` as its page. */
function seedOldVersion(browser: { stores: Map<string, FakeCache> }, html: string): void {
  const old = new FakeCache(async () => new Response());
  old.entries.set(SCOPE, html);
  browser.stores.set('cannstatt-cruiser-v0', old);
}

/** The server now answers with a page referencing `bundle`. */
const deploy = (browser: { network: Map<string, string> }, bundle: string) => {
  browser.network.set(SCOPE, page(bundle));
  browser.network.set(SCOPE + 'assets/' + bundle, bundle);
};

describe('service worker update signal', () => {
  it('stays silent on the first install', async () => {
    const { messages } = await installedBrowser();
    expect(messages).toEqual([]);
  });

  it('stays silent while the deployed page is unchanged', async () => {
    const { messages, worker } = await installedBrowser();
    await worker.navigate();
    expect(messages).toEqual([]);
  });

  it('posts updateReady once a changed page and its assets are cached', async () => {
    const browser = await installedBrowser();
    deploy(browser, 'index-new.js');
    await browser.worker.navigate();
    expect(browser.messages).toEqual([{ type: 'updateReady' }]);
    const cache = [...browser.stores.values()][0]!;
    expect(cache.entries.get(SCOPE)).toBe(page('index-new.js'));
    expect(cache.entries.has(SCOPE + 'assets/index-new.js')).toBe(true);
  });

  it('stays silent and keeps the old build when an asset of the new page fails', async () => {
    const browser = await installedBrowser();
    browser.network.set(SCOPE, page('index-broken.js'));
    await browser.worker.navigate();
    expect(browser.messages).toEqual([]);
    expect([...browser.stores.values()][0]!.entries.get(SCOPE)).toBe(page('index-old.js'));
  });

  it('posts updateReady when a new worker version caches a different page', async () => {
    const browser = createBrowser({ ...staticFiles(), '': page('index-new.js'), 'assets/index-new.js': 'new' });
    seedOldVersion(browser, page('index-old.js'));
    const worker = browser.startWorker();
    await worker.install();
    await worker.activate();
    expect(browser.messages).toEqual([{ type: 'updateReady' }]);
    expect([...browser.stores.keys()]).toHaveLength(1);
  });

  it('stays silent when a new worker version finds the same page', async () => {
    const browser = createBrowser({ ...staticFiles(), '': page('index-old.js'), 'assets/index-old.js': 'old' });
    seedOldVersion(browser, page('index-old.js'));
    const worker = browser.startWorker();
    await worker.install();
    await worker.activate();
    expect(browser.messages).toEqual([]);
  });
});

describe('service worker update check while the app stays open', () => {
  const CHECK = { type: 'checkForUpdate' };

  it('caches a changed deploy completely and then posts updateReady', async () => {
    const browser = await installedBrowser();
    deploy(browser, 'index-new.js');
    await browser.worker.message(CHECK);
    expect(browser.messages).toEqual([{ type: 'updateReady' }]);
    const cache = [...browser.stores.values()][0]!;
    expect(cache.entries.get(SCOPE)).toBe(page('index-new.js'));
    expect(cache.entries.has(SCOPE + 'assets/index-new.js')).toBe(true);
    expect(cache.entries.has(SCOPE + 'assets/index-old.js')).toBe(false);
  });

  it('does nothing while the deployed page is unchanged', async () => {
    const browser = await installedBrowser();
    await browser.worker.message(CHECK);
    expect(browser.messages).toEqual([]);
  });

  it('keeps the old build and stays silent when an asset of the new page fails', async () => {
    const browser = await installedBrowser();
    browser.network.set(SCOPE, page('index-broken.js'));
    await browser.worker.message(CHECK);
    expect(browser.messages).toEqual([]);
    expect([...browser.stores.values()][0]!.entries.get(SCOPE)).toBe(page('index-old.js'));
  });

  it('swallows offline errors and server errors', async () => {
    const browser = await installedBrowser();
    browser.net.offline = true;
    await expect(browser.worker.message(CHECK)).resolves.toBeUndefined();
    browser.net.offline = false;
    browser.network.delete(SCOPE);
    await expect(browser.worker.message(CHECK)).resolves.toBeUndefined();
    expect(browser.messages).toEqual([]);
    expect([...browser.stores.values()][0]!.entries.get(SCOPE)).toBe(page('index-old.js'));
  });

  it.each([null, 'checkForUpdate', { type: 'other' }])('ignores other messages (%j)', async (data) => {
    const browser = await installedBrowser();
    deploy(browser, 'index-new.js');
    await browser.worker.message(data);
    expect(browser.messages).toEqual([]);
  });
});
