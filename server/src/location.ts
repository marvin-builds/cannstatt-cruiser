/**
 * Coarse location of a request from Cloudflare's `request.cf` (derived from the
 * IP by Cloudflare; the IP itself is never read). Only country, region and city.
 */
const MAX_PLACE_LENGTH = 64;

export interface Location {
  country: string | null;
  region: string | null;
  city: string | null;
}

function place(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, MAX_PLACE_LENGTH).trim() || null;
}

/** Reads only country, region and city of `request.cf` (absent outside Cloudflare). */
export function locationOf(cf: unknown): Location {
  const props = (typeof cf === 'object' && cf !== null ? cf : {}) as Record<string, unknown>;
  return { country: place(props.country), region: place(props.region), city: place(props.city) };
}
