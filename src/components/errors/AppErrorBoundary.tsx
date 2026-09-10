"use client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorPanel } from "./ErrorPanel";
import { toAppError, type AppError } from "./report";

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: AppError | null;
}

/**
 * Root error boundary (wraps every page in `layout.tsx`): a render error
 * anywhere below shows the friendly panel instead of an empty page. Async
 * errors (data loads, event handlers) never reach a boundary — see
 * `GlobalErrorListener`.
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: toAppError(error, "render") };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[global-energy-map] render error:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) return <ErrorPanel error={this.state.error} variant="page" />;
    return this.props.children;
  }
}
