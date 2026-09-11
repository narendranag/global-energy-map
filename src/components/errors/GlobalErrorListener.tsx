"use client";
import { useEffect, useState } from "react";
import { ErrorPanel } from "./ErrorPanel";
import { APP_ERROR_EVENT, isIgnorable, toAppError, type AppError } from "./report";

/**
 * Catches what an error boundary cannot: uncaught errors (`window.onerror`),
 * unhandled promise rejections, and errors explicitly raised with
 * `reportError()`. Logs each to the console and shows the first one as a
 * dismissible panel over the page.
 */
export function GlobalErrorListener() {
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    const show = (e: AppError) => {
      setError((prev) => prev ?? e);
    };
    const onError = (ev: ErrorEvent) => {
      if (isIgnorable(ev.error, ev.message, ev.filename)) return;
      console.error("[global-energy-map] uncaught error:", ev.error ?? ev.message);
      show(toAppError(ev.error ?? ev.message, "error"));
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      if (isIgnorable(ev.reason)) return;
      console.error("[global-energy-map] unhandled rejection:", ev.reason);
      show(toAppError(ev.reason, "unhandledrejection"));
    };
    const onReport = (ev: Event) => {
      if (ev instanceof CustomEvent) show(ev.detail as AppError);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener(APP_ERROR_EVENT, onReport);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener(APP_ERROR_EVENT, onReport);
    };
  }, []);

  if (!error) return null;
  return (
    <ErrorPanel
      error={error}
      variant="overlay"
      onDismiss={() => {
        setError(null);
      }}
    />
  );
}
