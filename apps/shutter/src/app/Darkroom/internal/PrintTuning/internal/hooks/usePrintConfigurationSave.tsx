import { useCallback, useRef, useState } from "react";

import type {
  PrintConfigurationFormValues,
  PrintConfigurationSaveOptions,
} from "../PrintConfiguration.types";

import { reportPrintConfigurationError } from "../PrintConfiguration.utils";

type UpdatePrintConfiguration = (
  submittedValues: PrintConfigurationFormValues,
) => Promise<unknown>;

interface UsePrintConfigurationSaveParams {
  onPersisted: (
    submittedValues: PrintConfigurationFormValues,
    options: PrintConfigurationSaveOptions,
  ) => void;
  updatePrintConfiguration: UpdatePrintConfiguration;
}

export const usePrintConfigurationSave = ({
  onPersisted,
  updatePrintConfiguration,
}: UsePrintConfigurationSaveParams) => {
  const latestSaveRequestIdRef = useRef(0);
  const [isSavingPrintConfiguration, setIsSavingPrintConfiguration] =
    useState(false);

  const persistPrintConfiguration = useCallback(
    async (submittedValues: PrintConfigurationFormValues) => {
      try {
        await updatePrintConfiguration(submittedValues);
        return true;
      } catch (e) {
        reportPrintConfigurationError(
          e,
          "update-print-configuration-failed",
          "Update print configuration failed.",
        );
        return false;
      }
    },
    [updatePrintConfiguration],
  );

  const savePrintConfiguration = useCallback(
    (
      submittedValues: PrintConfigurationFormValues,
      options: PrintConfigurationSaveOptions = {},
    ) => {
      const requestId = latestSaveRequestIdRef.current + 1;
      latestSaveRequestIdRef.current = requestId;
      setIsSavingPrintConfiguration(true);

      return persistPrintConfiguration(submittedValues)
        .then((wasPersisted) => {
          const isLatestRequest = requestId === latestSaveRequestIdRef.current;

          if (!wasPersisted || !isLatestRequest) {
            return false;
          }

          onPersisted(submittedValues, options);

          return true;
        })
        .finally(() => {
          if (requestId === latestSaveRequestIdRef.current) {
            setIsSavingPrintConfiguration(false);
          }
        });
    },
    [onPersisted, persistPrintConfiguration],
  );

  return {
    isSavingPrintConfiguration,
    savePrintConfiguration,
  };
};
