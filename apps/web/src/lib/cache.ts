/** Kleiner In-Memory-Cache für GET-Anfragen (Modulwechsel ohne Flackern). */
export const cache = new Map<string, { at: number; value: unknown }>();
export const CACHE_MS = 60_000;

export function invalidateCache(prefix = '') {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}
