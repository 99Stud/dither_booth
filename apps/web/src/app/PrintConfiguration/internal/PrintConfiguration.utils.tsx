import { reportKioskError } from "#lib/logging/logging.utils";

import { PRINT_CONFIGURATION_LOG_SOURCE } from "./PrintConfiguration.constants";

export const reportPrintConfigurationError = (
  error: unknown,
  event: string,
  userMessage: string,
) => {
  return reportKioskError(error, {
    event,
    source: PRINT_CONFIGURATION_LOG_SOURCE,
    userMessage,
  });
};
