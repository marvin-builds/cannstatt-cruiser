/**
 * Guard for the stored board session (ROADMAP 74): player-supplied text (feedback, highscore names,
 * replies) must never become markup on the board. The sources may not use any HTML-parsing sink, and a
 * render with injection payloads must produce them only as text nodes. The project has no DOM library,
 * so a tiny fake document stands in; its elements throw on every HTML sink.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderBoard, type BoardHandlers } from './board';
import { renderLocked } from './locked';
import { sampleFeedback } from './sample-feedback';
import { sampleStats } from './sample-stats';

/** Every board source (tests excluded) as text, keyed by file name. */
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true })).map(([path, text]) => [
    path.slice(2),
    text,
  ]),
);
const SINKS = /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write(ln)?|createContextualFragment|DOMParser|srcdoc)\b/;

describe('board sources', () => {
  const sources = Object.keys(SOURCES);

  it('has sources to check', () => {
    expect(sources).toContain('board.ts');
    expect(sources).toContain('feedback-card.ts');
  });

  it.each(sources)('%s uses no HTML-parsing sink', (file) => {
    expect(SOURCES[file]).not.toMatch(SINKS);
  });
});

class FakeText {
  readonly nodeType = 3;
  constructor(readonly data: string) {}
}

class FakeElement {
  readonly nodeType = 1;
  readonly attributes = new Map<string, string>();
  children: (FakeElement | FakeText)[] = [];
  value = '';
  disabled = false;
  hidden = false;
  checked = false;
  constructor(readonly tagName: string) {}
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  append(...nodes: (FakeElement | FakeText | string)[]): void {
    for (const node of nodes) this.children.push(typeof node === 'string' ? new FakeText(node) : node);
  }
  replaceChildren(...nodes: (FakeElement | FakeText)[]): void {
    this.children = [];
    this.append(...nodes);
  }
  addEventListener(): void {}
  focus(): void {}
  querySelectorAll(): FakeElement[] {
    return [];
  }
  set innerHTML(_: string) {
    throw new Error('innerHTML must not be used');
  }
  set outerHTML(_: string) {
    throw new Error('outerHTML must not be used');
  }
  insertAdjacentHTML(): void {
    throw new Error('insertAdjacentHTML must not be used');
  }
}

const fakeDocument = {
  createElement: (tag: string) => new FakeElement(tag),
  createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
  createTextNode: (text: string) => new FakeText(text),
  write: () => {
    throw new Error('document.write must not be used');
  },
};

function walk(node: FakeElement | FakeText, visit: (n: FakeElement | FakeText) => void): void {
  visit(node);
  if (node instanceof FakeElement) for (const child of node.children) walk(child, visit);
}

function tags(root: FakeElement): string[] {
  const found: string[] = [];
  walk(root, (n) => n instanceof FakeElement && found.push(n.tagName));
  return found;
}

function texts(root: FakeElement): string[] {
  const found: string[] = [];
  walk(root, (n) => n instanceof FakeText && found.push(n.data));
  return found;
}

const SCRIPT = '<script>alert("x")</script>';
const IMG = '<img src=x onerror=alert(1)>';

const handlers: BoardHandlers = {
  onRange() {},
  onReload() {},
  onLock() {},
  onTestDevice() {},
  onTesters() {},
  feedback: {
    onFilter() {},
    onEntries() {},
    createIssue: async () => ({ ok: true, issue: 1 }),
    patch: async () => ({ ok: true, triage: { status: 'open', issue: null, reply: null, doneVersion: null } }),
    remove: async () => ({ ok: true }),
  },
};

describe('board render with injection payloads', () => {
  const original = (globalThis as { document?: unknown }).document;
  beforeEach(() => {
    (globalThis as { document?: unknown }).document = fakeDocument;
  });
  afterEach(() => {
    (globalThis as { document?: unknown }).document = original;
  });

  it('shows feedback text, a highscore name and a reply only as text', () => {
    const stats = sampleStats(7);
    stats.topScores = [{ name: IMG, score: 100, date: '2026-10-11T09:12:00.000Z' }, ...stats.topScores];
    const [first, ...rest] = sampleFeedback();
    const feedback = [{ ...first!, text: `${SCRIPT} ${IMG}`, reply: `${IMG} ${SCRIPT}`, log: [SCRIPT] }, ...rest];
    const root = new FakeElement('div');
    renderBoard(
      root as unknown as HTMLElement,
      {
        stats, range: 7, loading: false, error: null, remembered: false,
        feedback: { entries: feedback, filter: 'all', status: 'all' }, testDevice: false, testers: false, testerPassNote: null,
      },
      handlers,
    );
    const all = texts(root);
    expect(all).toContain(IMG);
    expect(all).toContain(`${SCRIPT} ${IMG}`);
    expect(all).toContain(`${IMG} ${SCRIPT}`);
    expect(all).toContain(SCRIPT);
    expect(tags(root)).not.toContain('script');
    expect(tags(root)).not.toContain('img');
    walk(root, (n) => {
      if (n instanceof FakeElement) for (const [name] of n.attributes) expect(name.startsWith('on'), name).toBe(false);
    });
  });

  it('shows a message on the locked view only as text', () => {
    const root = new FakeElement('div');
    renderLocked(root as unknown as HTMLElement, { message: SCRIPT, busy: false, canRetry: false, remember: false }, { onSubmit() {}, onRetry() {} });
    expect(texts(root)).toContain(SCRIPT);
    expect(tags(root)).not.toContain('script');
  });
});
