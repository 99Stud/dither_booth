import { ROOT_LOG_SOURCE } from "#app/Root/internal/Root.constants.ts";
import { Button, buttonVariants } from "#components/ui/button.tsx";
import { reportKioskError } from "#lib/logging/logging.utils.ts";
import { getKioskErrorDiagnostics } from "@dither-booth/logging";
import { Component, type ErrorInfo, useEffect } from "react";

import type {
  RootErrorBoundaryProps,
  RootErrorBoundaryState,
  RootScreenProps,
} from "./internal/RootErrorBoundary.types";

let lastReportedRootErrorKey: string | null = null;

const reportRootError = (
  error: unknown,
  event: string,
  userMessage: string,
  details?: Record<string, unknown>,
) => {
  const errorKey = `${event}:${getKioskErrorDiagnostics(error, userMessage).message}`;

  if (lastReportedRootErrorKey !== errorKey) {
    lastReportedRootErrorKey = errorKey;
    reportKioskError(error, {
      ...(details ? { details } : {}),
      event,
      source: ROOT_LOG_SOURCE,
      userMessage,
    });
  }
};

const RootScreen = ({ description, details, title }: RootScreenProps) => {
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 hud-grid-bg opacity-40"
      />
      <div className="relative z-10 flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex flex-col gap-1 font-mono">
          <h1 className="hud-text-glow-title text-lg tracking-wide">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <a className={buttonVariants({ variant: "outline" })} href="/">
            Back to home
          </a>
          <Button
            variant="hud"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload app
          </Button>
        </div>
        {details && <p className="text-xs text-muted-foreground">{details}</p>}
      </div>
    </div>
  );
};

const RootErrorScreen = ({ error }: { error: unknown }) => {
  useEffect(() => {
    reportRootError(error, "root-route-render-failed", "This screen failed.");
  }, [error]);

  return (
    <RootScreen
      title="Something went wrong"
      description="This screen failed to load."
    />
  );
};

export const RootNotFoundScreen = () => {
  return (
    <RootScreen
      title="Page not found"
      description="This page does not exist."
    />
  );
};

export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  override state: RootErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportRootError(
      error,
      "root-app-render-failed",
      "The app failed to load.",
      {
        componentStack: errorInfo.componentStack,
      },
    );
  }

  override render() {
    if (this.state.error) {
      return <RootErrorScreen error={this.state.error} />;
    }

    return this.props.children;
  }
}

export { RootErrorScreen };
