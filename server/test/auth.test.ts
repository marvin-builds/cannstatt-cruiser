import { describe, expect, it } from 'vitest';
import { isAuthorized } from '../src/auth';

const TOKEN = 'c2VjcmV0LXRva2VuLWZvci10ZXN0cy1vbmx5LTAxMjM0NTY3OA==';

describe('isAuthorized', () => {
  it('accepts the matching bearer token', async () => {
    expect(await isAuthorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it('rejects a missing, malformed or wrong header', async () => {
    for (const header of [null, '', TOKEN, `Basic ${TOKEN}`, `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(1)}`, 'Bearer ', `bearer  ${TOKEN}`]) {
      expect(await isAuthorized(header, TOKEN), String(header)).toBe(false);
    }
  });

  it('rejects everything when no token is configured', async () => {
    expect(await isAuthorized('Bearer ', undefined)).toBe(false);
    expect(await isAuthorized('Bearer ', '')).toBe(false);
    expect(await isAuthorized('Bearer undefined', undefined)).toBe(false);
  });

  it('ignores whitespace around the configured token, but a blank one still rejects everything', async () => {
    expect(await isAuthorized(`Bearer ${TOKEN}`, `  ${TOKEN}\n`)).toBe(true);
    expect(await isAuthorized('Bearer ', ' \n')).toBe(false);
  });
});
