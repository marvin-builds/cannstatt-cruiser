/**
 * CORS: the game on GitHub Pages and local dev servers (any port on
 * localhost / 127.0.0.1) may call the API; other origins get no allow-origin.
 */
const ALLOWED_ORIGIN = /^(https:\/\/marvinmai\.github\.io|http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/;

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin !== null && ALLOWED_ORIGIN.test(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
