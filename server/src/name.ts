/**
 * Nickname rules: 2-16 characters after trimming and collapsing runs of
 * spaces; only ASCII letters, German umlauts and ß, digits, space and - _ .
 */
export const NAME_MIN = 2;
export const NAME_MAX = 16;

const ALLOWED = /^[A-Za-z0-9äöüßÄÖÜ _.-]+$/;

/** Returns the cleaned name, or null when it breaks the rules. */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
  if (name.length < NAME_MIN || name.length > NAME_MAX) return null;
  return ALLOWED.test(name) ? name : null;
}
