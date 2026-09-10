"use client";
import { useEffect, useState } from "react";

export interface AsyncState<T> {
  /** Latest resolved value — possibly for a previous `args` while a new load runs. */
  readonly data: T | null;
  /** True once `data` belongs to the current `args`. */
  readonly ready: boolean;
}

/**
 * Run `load(...args)` whenever `args` changes; `args === null` disables the
 * load (and keeps whatever was last loaded). `load` should be a stable,
 * module-level (ideally `cachedLoader`-wrapped) function.
 *
 * Keeping the previous value while the next one loads avoids flashing a
 * layer off on every slider tick; `ready` tells the caller whether it is
 * current (the page's pending count / `data-ready` signal uses it).
 */
export function useAsync<A extends readonly (string | number)[], T>(
  load: (...args: A) => Promise<T>,
  args: A | null,
): AsyncState<T> {
  const key = args === null ? null : JSON.stringify(args);
  const [state, setState] = useState<{ key: string; data: T } | null>(null);

  useEffect(() => {
    if (key === null) return;
    const ctrl = { cancelled: false };
    load(...(JSON.parse(key) as A)).then(
      (data) => {
        if (!ctrl.cancelled) setState({ key, data });
      },
      (err: unknown) => {
        console.error(`load failed (${key}):`, err);
      },
    );
    return () => {
      ctrl.cancelled = true;
    };
  }, [load, key]);

  return { data: state?.data ?? null, ready: state !== null && state.key === key };
}
