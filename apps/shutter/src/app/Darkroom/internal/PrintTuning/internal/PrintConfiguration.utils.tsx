import { reportKioskError } from "#lib/logging/logging.utils";

import type {
  PrintConfigurationEncodedImage,
  PrintConfigurationFormValues,
  PrintConfigurationInitialPreviewByTab,
  PrintConfigurationTab,
} from "./PrintConfiguration.types";

import {
  PREVIEW_FIELDS_BY_TAB,
  PRINT_CONFIGURATION_LOG_SOURCE,
  PRINT_CONFIGURATION_TABS,
} from "./PrintConfiguration.constants";

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

export const getInitialPreviewTriggerState =
  (): PrintConfigurationInitialPreviewByTab => ({
    dithering: false,
    receipt: false,
  });

export const clonePrintConfigurationFormValues = (
  values: PrintConfigurationFormValues,
): PrintConfigurationFormValues => ({ ...values });

export const getChangedPreviewTabs = (
  previousValues: PrintConfigurationFormValues | undefined,
  nextValues: PrintConfigurationFormValues,
) => {
  if (!previousValues) {
    return [...PRINT_CONFIGURATION_TABS];
  }

  return PRINT_CONFIGURATION_TABS.filter((tab) =>
    PREVIEW_FIELDS_BY_TAB[tab].some(
      (field) => !Object.is(previousValues[field], nextValues[field]),
    ),
  );
};

export const isPrintConfigurationTab = (
  value: string,
): value is PrintConfigurationTab =>
  (PRINT_CONFIGURATION_TABS as ReadonlyArray<string>).includes(value);

export const getPrintConfigurationImageDataUrl = (
  image: PrintConfigurationEncodedImage,
) => `data:${image.mimeType};base64,${image.data}`;
