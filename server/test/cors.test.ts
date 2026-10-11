import { describe, expect, it } from 'vitest';
import { corsHeaders, isAllowedOrigin } from '../src/cors';

describe('corsHeaders', () => {
  it('allows the GitHub Pages origin and local dev servers', () => {
    for (const origin of ['https://marvinmai.github.io', 'http://localhost:5173', 'http://127.0.0.1:4318', 'http://localhost']) {
      expect(corsHeaders(origin)['Access-Control-Allow-Origin'], origin).toBe(origin);
    }
  });

  it('gives no allow-origin to other origins', () => {
    for (const origin of [null, 'https://evil.example', 'https://marvinmai.github.io.evil.example', 'http://localhost.evil.example', 'https://localhost:5173']) {
      expect(corsHeaders(origin)['Access-Control-Allow-Origin'], String(origin)).toBeUndefined();
    }
  });

  it('names the methods and headers and varies on Origin', () => {
    const headers = corsHeaders('https://marvinmai.github.io');
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, PATCH, DELETE, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
    expect(headers.Vary).toBe('Origin');
    expect(headers['Access-Control-Allow-Credentials']).toBeUndefined();
  });
});

describe('isAllowedOrigin', () => {
  it('is true only for the game origins', () => {
    expect(isAllowedOrigin('https://marvinmai.github.io')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    for (const origin of [null, '', 'null', 'https://evil.example', 'https://marvinmai.github.io.evil.example']) {
      expect(isAllowedOrigin(origin), String(origin)).toBe(false);
    }
  });
});
