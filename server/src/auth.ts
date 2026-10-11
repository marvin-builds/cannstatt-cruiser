/**
 * Bearer-token check for the board routes. Both sides are hashed with SHA-256 first,
 * so the constant-time comparison always sees equal-length inputs.
 */
const PREFIX = 'Bearer ';

type TimingSafeEqual = (a: Uint8Array, b: Uint8Array) => boolean;

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

/** Constant-time equality of two equal-length buffers (fallback where the runtime has none). */
function constantTimeFallback(x: Uint8Array, y: Uint8Array): boolean {
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ (y[i] ?? 0);
  return diff === 0;
}

/** Constant-time equality of two equal-length buffers, natively where the runtime offers it. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const native = (crypto.subtle as unknown as { timingSafeEqual?: TimingSafeEqual }).timingSafeEqual;
  return native ? native.call(crypto.subtle, a, b) : constantTimeFallback(a, b);
}

/** The token after `Bearer `, or null without such a header. */
export function bearerToken(header: string | null): string | null {
  return header !== null && header.startsWith(PREFIX) ? header.slice(PREFIX.length) : null;
}

/**
 * Whether the Authorization header carries `token` (a Wrangler secret; whitespace around it, e.g. a
 * pasted line break, is ignored). Always false when no token is configured.
 */
export async function isAuthorized(header: string | null, token: string | undefined): Promise<boolean> {
  const expected = token?.trim();
  const given = bearerToken(header);
  if (!expected || given === null) return false;
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  return constantTimeEqual(new Uint8Array(a), new Uint8Array(b));
}
