/**
 * Bearer-token check for GET /stats. Both sides are hashed with SHA-256 first,
 * so the constant-time comparison always sees equal-length inputs.
 */
const PREFIX = 'Bearer ';

type TimingSafeEqual = (a: ArrayBuffer, b: ArrayBuffer) => boolean;

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

/** Constant-time equality of two equal-length buffers (fallback where the runtime has none). */
function constantTimeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ (y[i] ?? 0);
  return diff === 0;
}

/** Whether the Authorization header carries `token`. Always false when no token is configured. */
export async function isAuthorized(header: string | null, token: string | undefined): Promise<boolean> {
  if (!token || header === null || !header.startsWith(PREFIX)) return false;
  const [given, expected] = await Promise.all([sha256(header.slice(PREFIX.length)), sha256(token)]);
  const native = (crypto.subtle as unknown as { timingSafeEqual?: TimingSafeEqual }).timingSafeEqual;
  return native ? native.call(crypto.subtle, given, expected) : constantTimeEqual(given, expected);
}
