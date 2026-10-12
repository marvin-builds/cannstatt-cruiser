/**
 * Vitest only: walks a text catalogue for the catalogue tests: its shape (keys, list lengths, function
 * arities) and every text it can produce, functions called with sample arguments.
 */

/** Sample arguments for catalogue functions: both flags, a formatted number, a name. */
const SAMPLES: readonly unknown[] = [true, false, '1.234', 'Marvin'];

function argumentSets(arity: number): unknown[][] {
  if (arity === 0) return [[]];
  return argumentSets(arity - 1).flatMap((rest) => SAMPLES.map((s) => [s, ...rest]));
}

/** The catalogue's shape: the same for every language. */
export function shapeOf(value: unknown): unknown {
  if (typeof value === 'string') return 'text';
  if (typeof value === 'function') return `function/${value.length}`;
  if (Array.isArray(value)) return value.map(shapeOf);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shapeOf(v)]));
  return typeof value;
}

export interface CatalogueText {
  /** "menu.next", "title.help(true,…)[2]". */
  path: string;
  text: string;
}

/** Every text in `value`, functions called with every combination of the sample arguments. */
export function catalogueStrings(value: unknown, path = ''): CatalogueText[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (typeof value === 'function') {
    return argumentSets(value.length).flatMap((args) => catalogueStrings((value as (...a: unknown[]) => unknown)(...args), `${path}(${args.join(',')})`));
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => catalogueStrings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => catalogueStrings(v, path ? `${path}.${k}` : k));
  return [];
}
