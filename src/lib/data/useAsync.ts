"use client";
import { useCallback, useEffect, useState } from "react";
import { reportError } from "@/components/errors/report";

export interface AsyncState<T> {
  /** Latest resolved value — possibly for a previous `args` while a new load runs. */
  readonly data: T | null;
  /** True once `data` belongs to the current `args`. */
  readonly ready: boolean;
  /**
   * Set when the load for the current `args` rejected. Only ever set for a
   * non-fatal load (`fatal: false`); a fatal one reports to the error panel
   * and never returns here.
   */
  readonly error: unknown;
  /** Re-run the load. A no-op while `args` is null. */
  readonly retry: () => void;
}

export interface UseAsyncOptions {
  /**
   * True (the default) sends a rejection to the global error panel: the map's
   * critical path must never sit on "Loading" forever.
   *
   * False keeps it local — `error` is set and the caller renders its own
   * inline notice (B7). Used by the country panel, which is a *second* reader
   * off the critical path: a 750 KB GIE fetch failing behind one of its five
   * sections must not replace the whole map with an error page.
   */
  readonly fatal?: boolean;
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
  options: UseAsyncOptions = {},
): AsyncState<T> {
  const fatal = options.fatal !== false;
  const key = args === null ? null : JSON.stringify(args);
  const [state, setState] = useState<{ key: string; data: T } | null>(null);
  const [failure, setFailure] = useState<{ key: string; error: unknown } | null>(null);
  // Bumped by `retry`, so the effect re-runs for the same `args`.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) return;
    const ctrl = { cancelled: false };
    load(...(JSON.parse(key) as A)).then(
      (data) => {
        if (ctrl.cancelled) return;
        setFailure(null);
        setState({ key, data });
      },
      (err: unknown) => {
        if (ctrl.cancelled) return;
        // Surface it: a silent failure left the map on "Loading" forever.
        if (fatal) reportError(err, `load failed (${key})`);
        else setFailure({ key, error: err });
      },
    );
    return () => {
      ctrl.cancelled = true;
    };
  }, [load, key, fatal, attempt]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((n) => n + 1);
  }, []);

  return {
    data: state?.data ?? null,
    ready: state !== null && state.key === key,
    error: failure !== null && failure.key === key ? failure.error : null,
    retry,
  };
}
