// src/components/errors/report.ts — dependency-free runtime error plumbing.
//
// No hosted error service (Sentry etc. would need an account + DSN): errors
// are logged to the console and surfaced to the reader as a friendly panel
// with a pre-filled GitHub issue link.

/** Where readers report problems. */
export const ISSUES_URL = "https://github.com/narendranag/global-energy-map/issues";

/**
 * Window event carrying an {@link AppError} as `detail`. Code that catches an
 * error it cannot recover from (e.g. a failed data load) calls
 * {@link reportError}, which dispatches this; `GlobalErrorListener` shows the
 * panel.
 */
export const APP_ERROR_EVENT = "gem:error";

export type AppErrorSource = "render" | "error" | "unhandledrejection" | "report";

export interface AppError {
  readonly message: string;
  readonly stack: string | undefined;
  readonly source: AppErrorSource;
  /** What was happening, e.g. "loading assets.parquet". */
  readonly context: string | undefined;
}

/** Normalise anything thrown (Error, string, DOMException, object) into an {@link AppError}. */
export function toAppError(err: unknown, source: AppErrorSource, context?: string): AppError {
  let message: string;
  let stack: string | undefined;
  if (err instanceof Error) {
    message = err.message || err.name;
    stack = err.stack;
  } else if (typeof err === "string") {
    message = err;
  } else {
    try {
      // JSON.stringify(undefined) is undefined at runtime despite its type.
      const json = JSON.stringify(err) as string | undefined;
      message = json ?? String(err);
    } catch {
      message = String(err);
    }
  }
  return { message: message || "Unknown error", stack, source, context };
}

/**
 * Noise that should never raise the panel: benign browser warnings routed
 * through `window.onerror`, aborted fetches, opaque cross-origin script
 * errors, and anything thrown by a browser extension.
 */
export function isIgnorable(err: unknown, message = "", filename = ""): boolean {
  if (err instanceof Error && err.name === "AbortError") return true;
  if (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") {
    return true;
  }
  const text = message || (err instanceof Error ? err.message : "");
  if (/ResizeObserver loop/i.test(text)) return true;
  if (text === "Script error." || text === "Script error") return true;
  if (/^(chrome|moz|safari(-web)?)-extension:/.test(filename)) return true;
  return false;
}

/** Log an error and raise the in-app error panel. Safe to call anywhere on the client. */
export function reportError(err: unknown, context?: string): void {
  console.error(`[global-energy-map] ${context ?? "error"}:`, err);
  if (typeof window === "undefined" || isIgnorable(err)) return;
  window.dispatchEvent(
    new CustomEvent<AppError>(APP_ERROR_EVENT, { detail: toAppError(err, "report", context) }),
  );
}

const MAX_STACK = 1500;

/** A "new issue" URL pre-filled with the error, the page URL and the browser. */
export function issueUrl(error: AppError): string {
  const page = typeof window === "undefined" ? "" : window.location.href;
  const browser = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const stack = error.stack ? error.stack.slice(0, MAX_STACK) : "";
  const body = [
    "**What were you doing?**",
    "",
    "<!-- e.g. switched to the gas scenario, moved the year slider -->",
    "",
    "**Error**",
    "",
    "```",
    `${error.source}${error.context ? ` (${error.context})` : ""}: ${error.message}`,
    stack,
    "```",
    "",
    `**Page:** ${page}`,
    `**Browser:** ${browser}`,
  ].join("\n");
  const title = `Runtime error: ${error.message.slice(0, 80)}`;
  return `${ISSUES_URL}/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
