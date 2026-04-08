import { reportKioskError } from "#lib/logging/logging.utils.ts";

import { PRINT_CONFIGURATION_PANEL_LOG_SOURCE } from "./PrintConfigurationPanel.constants";

export const reportPrintConfigurationError = (
  error: unknown,
  event: string,
  userMessage: string,
) => {
  return reportKioskError(error, {
    event,
    source: PRINT_CONFIGURATION_PANEL_LOG_SOURCE,
    userMessage,
  });
};
