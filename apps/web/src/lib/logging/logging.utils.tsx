import {
  getKioskErrorDiagnostics,
  logKioskEvent,
  type ReportKioskErrorOptions,
} from "@dither-booth/logging";
import { toast } from "sonner";

export const reportKioskError = (
  error: unknown,
  options: ReportKioskErrorOptions,
) => {
  const { details, event, source, userMessage } = options;

  toast.error(userMessage);
  logKioskEvent("error", source, event, {
    ...(details ? { details } : {}),
    error: getKioskErrorDiagnostics(error, userMessage),
  });

  return userMessage;
};
