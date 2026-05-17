"use client";
import { useCallback, useMemo } from "react";
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

  const setState = useCallback(
    (partial: Partial<AppState>) => {
      const merged: AppState = {
        ...state,
        ...partial,
        layers: { ...state.layers, ...(partial.layers ?? {}) },
      };
      const qs = encodeAppState(merged);
      router.replace(`?${qs}`, { scroll: false });
    },
    [state, router],
  );

  return [state, setState];
}
