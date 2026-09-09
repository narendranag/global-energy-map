"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { encodeAppState, decodeAppState, type AppState } from "./encode";

export function useUrlState(defaults: AppState): [
  AppState,
  (next: Partial<AppState>) => void,
] {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Decode current state from the URL on each render. searchParams is stable
  // when the URL hasn't changed, so this is cheap.
  const state = useMemo(
    () => decodeAppState(new URLSearchParams(searchParams.toString()), defaults),
    [searchParams, defaults],
  );

  // router.replace() is asynchronous: the URL (and therefore `searchParams`
  // and the `state` above) doesn't update until the navigation round-trips
  // and this hook re-renders. If setState is called twice in quick
  // succession — e.g. a commodity toggle immediately followed by a scenario
  // pick — the second call would otherwise merge against the stale
  // pre-navigation `state`, silently reverting the first change. Track the
  // latest merged state in a ref so consecutive calls compose correctly
  // regardless of whether the URL has caught up yet.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setState = useCallback(
    (partial: Partial<AppState>) => {
      const current = stateRef.current;
      const merged: AppState = {
        ...current,
        ...partial,
        layers: { ...current.layers, ...(partial.layers ?? {}) },
      };
      stateRef.current = merged;
      const qs = encodeAppState(merged);
      router.replace(`?${qs}`, { scroll: false });
    },
    [router],
  );

  return [state, setState];
}
