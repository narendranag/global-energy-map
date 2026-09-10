"use client";
import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/export/browser";

export interface CopyButtonProps {
  /** Text to copy; a function is evaluated at click time. */
  readonly text: string | (() => string);
  readonly label?: string;
  /** Accessible name when the visible label is terse (e.g. "Copy sha256 of …"). */
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly onCopied?: () => void;
}

/** Copy button with a 2-second "Copied" confirmation announced to screen readers. */
export function CopyButton({ text, label = "Copy", ariaLabel, className, onCopied }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = () => {
    const value = typeof text === "function" ? text() : text;
    void copyText(value).then((ok) => {
      setState(ok ? "copied" : "failed");
      if (ok) onCopied?.();
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setState("idle");
      }, 2000);
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={
        className ??
        "rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700"
      }
    >
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}</span>
    </button>
  );
}
