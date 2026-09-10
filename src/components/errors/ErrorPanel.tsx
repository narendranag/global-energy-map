"use client";
import { ISSUES_URL, issueUrl, type AppError } from "./report";

export interface ErrorPanelProps {
  readonly error: AppError;
  /**
   * `page` replaces the whole view (a render error unmounted the tree);
   * `overlay` floats over a page that may still partly work.
   */
  readonly variant: "page" | "overlay";
  /** Overlay only: hide the panel and keep using the page. */
  readonly onDismiss?: () => void;
}

/** "the map" on the home page, "this page" elsewhere. */
function subject(): string {
  return typeof window !== "undefined" && window.location.pathname === "/" ? "the map" : "this page";
}

const BUTTON =
  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2";

/**
 * Friendly replacement for a blank map: what happened, reload, report. Sets
 * its own text colours (panels must not inherit the body foreground).
 */
export function ErrorPanel({ error, variant, onDismiss }: ErrorPanelProps) {
  const card = (
    <div
      role="alert"
      data-testid="app-error"
      data-error-source={error.source}
      className="pointer-events-auto w-full max-w-md rounded-md border border-panel-border bg-white p-4 text-sm text-ink shadow-xl"
    >
      <h2 className="text-base font-semibold text-ink">Something went wrong loading {subject()}</h2>
      <p className="mt-2 leading-snug text-ink-muted">
        {variant === "page"
          ? "The page hit an unexpected error and could not be displayed."
          : "Part of the page failed to load, so what you see may be incomplete."}{" "}
        Reloading usually fixes it. If it keeps happening, please report it — the link
        pre-fills the error details (no personal data is sent anywhere automatically).
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            window.location.reload();
          }}
          className={`${BUTTON} border-ink bg-ink text-white hover:bg-ink-muted`}
        >
          Reload
        </button>
        <a
          href={issueUrl(error)}
          target="_blank"
          rel="noreferrer"
          className={`${BUTTON} border-panel-border bg-white text-ink hover:bg-slate-50`}
        >
          Report this problem
        </a>
        {variant === "overlay" && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={`${BUTTON} border-transparent bg-white text-ink-muted hover:text-ink`}
          >
            Dismiss
          </button>
        )}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-ink-muted">Error details</summary>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 font-mono text-2xs text-ink">
          {error.context ? `${error.context}: ` : ""}
          {error.message}
        </pre>
        <p className="mt-1 text-2xs text-ink-subtle">
          Or browse <a className="underline" href={ISSUES_URL} target="_blank" rel="noreferrer">known issues</a>.
        </p>
      </details>
    </div>
  );

  if (variant === "page") {
    return (
      <div className="flex min-h-dvh w-full items-center justify-center bg-white p-4 text-ink">
        {card}
      </div>
    );
  }
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
      {card}
    </div>
  );
}
