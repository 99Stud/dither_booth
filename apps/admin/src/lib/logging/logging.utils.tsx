import {
  getKioskErrorDiagnostics,
  logKioskEvent,
  type ReportKioskErrorOptions,
} from "@dither-booth/logging";

import { notify } from "#lib/feedback/notify";

export const reportKioskError = (
  error: unknown,
  options: ReportKioskErrorOptions,
) => {
  const { details, event, source, userMessage } = options;

  notify.error(userMessage);
  logKioskEvent("error", source, event, {
    ...(details ? { details } : {}),
    error: getKioskErrorDiagnostics(error, userMessage),
  });

  return userMessage;
};
