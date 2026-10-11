/**
 * Safe DOM builders: text only ever goes in as text nodes and attributes via
 * setAttribute, so player-chosen names can never become markup.
 */

export type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | undefined>;

function apply(node: Element, attrs: Attrs, children: Child[]): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  apply(node, attrs, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  apply(node, attrs, children);
  return node;
}
