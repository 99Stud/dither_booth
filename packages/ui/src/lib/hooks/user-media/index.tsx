import type { CameraState } from "#hooks/user-media/index";

import {
  getKioskErrorDiagnostics,
  logKioskEvent,
  type ReportKioskErrorOptions,
} from "@dither-booth/logging";
import { toast } from "sonner";

export type CreateUserMediaReportersParams = {
  source: string;
};

export type UserMediaReporters = {
  reportUserMediaCameraStateChange: (
    cameraState: CameraState,
    diagnosticError?: unknown,
  ) => void;
  reportUserMediaConstraintFallbackError: (error: unknown) => void;
};

const reportKioskError = (error: unknown, options: ReportKioskErrorOptions) => {
  const { details, event, source, userMessage } = options;

  toast.error(userMessage);
  logKioskEvent("error", source, event, {
    ...(details ? { details } : {}),
    error: getKioskErrorDiagnostics(error, userMessage),
  });

  return userMessage;
};

export const createUserMediaReporters = (
  params: CreateUserMediaReportersParams,
): UserMediaReporters => {
  const { source } = params;

  return {
    reportUserMediaCameraStateChange: (
      cameraState: CameraState,
      diagnosticError?: unknown,
    ) => {
      const isCameraFailure =
        cameraState.status === "error" || cameraState.status === "unsupported";

      if (isCameraFailure) {
        const userMessage =
          cameraState.status === "unsupported"
            ? "Camera is not supported in this environment."
            : "Camera failed.";

        reportKioskError(
          diagnosticError ?? new Error(cameraState.error ?? userMessage),
          {
            details: {
              isSecureContext: cameraState.isSecureContext,
              status: cameraState.status,
            },
            event: "camera-state-changed",
            source,
            userMessage: cameraState.error ?? userMessage,
          },
        );

        return;
      }

      logKioskEvent("info", source, "camera-state-changed", {
        details: {
          error: cameraState.error,
          isSecureContext: cameraState.isSecureContext,
          status: cameraState.status,
        },
      });
    },
    reportUserMediaConstraintFallbackError: (error: unknown) => {
      logKioskEvent("warn", source, "constraint-fallback-failed", {
        error: getKioskErrorDiagnostics(
          error,
          "Camera constraint fallback failed.",
        ),
      });
    },
  };
};
