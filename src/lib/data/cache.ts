import { dataUrl } from "./urls";

/**
 * Memoise an async loader by its arguments. The in-flight *promise* is cached
 * (not the resolved value), so callers asking in the same tick share one
 * fetch/query. A rejected promise is evicted so a later call retries.
 */
export function cachedLoader<A extends readonly (string | number)[], T>(
  load: (...args: A) => Promise<T>,
): (...args: A) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (...args: A) => {
    const key = JSON.stringify(args);
    let p = cache.get(key);
    if (p === undefined) {
      p = load(...args).catch((err: unknown) => {
        cache.delete(key);
        throw err;
      });
      cache.set(key, p);
    }
    return p;
  };
}

/**
 * Fetch and parse a same-origin JSON file (GeoJSON sidecars) through its
 * versioned, immutable-cacheable URL (see urls.ts). Low fetch priority: the
 * multi-MB sidecars render on their own, while the parquet files they compete
 * with for bandwidth gate every point layer and the scenario (P3).
 */
export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(dataUrl(path), { priority: "low" });
  if (!res.ok) throw new Error(`${path} fetch failed: ${String(res.status)}`);
  return (await res.json()) as T;
}
