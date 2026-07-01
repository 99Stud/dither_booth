import type { WebcamHandle } from "@dither-booth/ui/components/misc/Webcam";

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dither-booth/ui/components/ui/tabs";
import { createUserMediaReporters } from "@dither-booth/ui/lib/hooks/user-media";
import { takeSquarePhotoAndFlipHorizontally } from "@dither-booth/ui/lib/image-manipulation";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useCallback, useMemo, useRef } from "react";

import { AppSidebarPageHeader } from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";
import { ADMIN_CAMERA_LOG_SOURCE } from "#lib/constants";
import { useTRPC } from "#lib/trpc/trpc.client";

import type { PrintConfigurationFormValues } from "./internal/PrintConfiguration.types";

import { PrintConfigurationActions } from "./internal/components/PrintConfigurationActions";
import { PrintConfigurationFormFields } from "./internal/components/PrintConfigurationFormFields";
import { PrintConfigurationPreviewPanel } from "./internal/components/PrintConfigurationPreviewPanel";
import { usePrintConfigurationPreview } from "./internal/hooks/usePrintConfigurationPreview";
import { usePrintConfigurationSave } from "./internal/hooks/usePrintConfigurationSave";
import {
  DEFAULT_PRINT_CONFIGURATION_FORM_VALUES,
  PRINT_CONFIGURATION_FORM_AUTOSAVE_DEBOUNCE_MS,
  PRINT_CONFIGURATION_FORM_SCHEMA,
  PRINT_CONFIGURATION_LOG_SOURCE,
  getPrintConfigurationFormValues,
} from "./internal/PrintConfiguration.constants";
import { reportPrintConfigurationError } from "./internal/PrintConfiguration.utils";

const {
  reportUserMediaCameraStateChange,
  reportUserMediaConstraintFallbackError,
} = createUserMediaReporters({ source: ADMIN_CAMERA_LOG_SOURCE });

export const PrintConfiguration = () => {
  const webcamRef = useRef<WebcamHandle>(null);

  const trpc = useTRPC();

  const printConfigurationQueryOptions =
    trpc.getPrintConfiguration.queryOptions();
  const { data: printConfiguration, isLoading: isLoadingPrintConfiguration } =
    useQuery(printConfigurationQueryOptions);

  const {
    mutateAsync: updatePrintConfiguration,
    isPending: isUpdatingPrintConfiguration,
  } = useMutation({
    ...trpc.updatePrintConfiguration.mutationOptions(),
    scope: { id: "print-configuration-save" },
  });

  const { mutateAsync: ditherPhoto, isPending: isDithering } = useMutation(
    trpc.dither.mutationOptions(),
  );

  const { mutateAsync: printReceiptImage, isPending: isPrintingReceipt } =
    useMutation(trpc.printReceipt.mutationOptions());

  const { mutateAsync: generateReceiptImage, isPending: isGeneratingReceipt } =
    useMutation(trpc.generateReceipt.mutationOptions());

  const takeSquarePhoto = useCallback(async () => {
    return await takeSquarePhotoAndFlipHorizontally(
      PRINT_CONFIGURATION_LOG_SOURCE,
      async () => {
        if (!webcamRef.current) {
          throw new Error("Camera is not available.");
        }

        return await webcamRef.current.takePhoto();
      },
    );
  }, []);

  const defaultValues = useMemo<PrintConfigurationFormValues>(
    () => getPrintConfigurationFormValues(printConfiguration),
    [printConfiguration],
  );

  const {
    activePreviewSrc,
    activeTab,
    handleActiveTabChange,
    hasTriggeredActiveInitialPreview,
    isRefreshingActivePreview,
    refreshActivePreview,
    refreshPreviewAfterSave,
  } = usePrintConfigurationPreview({
    ditherPhoto,
    generateReceiptImage,
    isDithering,
    isGeneratingReceipt,
    isLoadingPrintConfiguration,
    persistedPrintConfiguration: defaultValues,
    takeSquarePhoto,
    webcamRef,
  });

  const { isSavingPrintConfiguration, savePrintConfiguration } =
    usePrintConfigurationSave({
      onPersisted: refreshPreviewAfterSave,
      updatePrintConfiguration,
    });

  const printReceipt = useCallback(async () => {
    try {
      const squarePhoto = await takeSquarePhoto();

      if (!squarePhoto) {
        throw new Error("Square photo is not available.");
      }

      await printReceiptImage(squarePhoto);
    } catch (e) {
      reportPrintConfigurationError(
        e,
        "print-receipt-failed",
        "Print receipt failed.",
      );
    }
  }, [printReceiptImage, takeSquarePhoto]);

  const isPersistingPrintConfiguration =
    isLoadingPrintConfiguration ||
    isSavingPrintConfiguration ||
    isUpdatingPrintConfiguration;
  const isSelectFieldDisabled = isPersistingPrintConfiguration || isDithering;
  const isSwitchFieldDisabled = isPersistingPrintConfiguration;
  const isSliderFieldDisabled = isPersistingPrintConfiguration;

  const form = useForm({
    defaultValues,
    validators: {
      onChange: PRINT_CONFIGURATION_FORM_SCHEMA,
      onSubmit: PRINT_CONFIGURATION_FORM_SCHEMA,
    },
    listeners: {
      onChangeDebounceMs: PRINT_CONFIGURATION_FORM_AUTOSAVE_DEBOUNCE_MS,
      onChange: async () => {
        await form.handleSubmit();
      },
    },
    onSubmit: async (submitted) => {
      await savePrintConfiguration(submitted.value);
    },
  });

  const resetPrintConfiguration = useCallback(async () => {
    const wasPersisted = await savePrintConfiguration(
      DEFAULT_PRINT_CONFIGURATION_FORM_VALUES,
      { forceActivePreviewRefresh: true },
    );

    if (!wasPersisted) {
      return;
    }

    form.reset(DEFAULT_PRINT_CONFIGURATION_FORM_VALUES);
  }, [form, savePrintConfiguration]);

  return (
    <Tabs
      className={clsx("gap-0")}
      value={activeTab}
      onValueChange={handleActiveTabChange}
    >
      <AppSidebarPageHeader title="Print configuration">
        <TabsList>
          <TabsTrigger value="dithering">Dithering</TabsTrigger>
          <TabsTrigger value="receipt">Receipt</TabsTrigger>
        </TabsList>
      </AppSidebarPageHeader>
      <div
        className={clsx(
          "h-[calc(100dvh-4rem)] group-has-data-[collapsible=icon]/sidebar-wrapper:h-[calc(100dvh-3rem)]",
          "pr-2 pb-2",
          "flex gap-2",
        )}
      >
        <PrintConfigurationPreviewPanel
          webcamRef={webcamRef}
          hasTriggeredInitialPreview={hasTriggeredActiveInitialPreview}
          isLoading={isRefreshingActivePreview}
          isRefreshDisabled={isRefreshingActivePreview}
          previewSrc={activePreviewSrc}
          onRefreshPreview={refreshActivePreview}
          onCameraStateChange={reportUserMediaCameraStateChange}
          onConstraintFallbackError={reportUserMediaConstraintFallbackError}
        />
        <div className={clsx("flex-1", "flex flex-col justify-between gap-2")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
          >
            <PrintConfigurationFormFields
              form={form}
              isSelectFieldDisabled={isSelectFieldDisabled}
              isSliderFieldDisabled={isSliderFieldDisabled}
              isSwitchFieldDisabled={isSwitchFieldDisabled}
            />
          </form>
          <PrintConfigurationActions
            isResetDisabled={isPersistingPrintConfiguration}
            isPrintReceiptDisabled={
              isPersistingPrintConfiguration || isPrintingReceipt
            }
            isPrintingReceipt={isPrintingReceipt}
            onResetConfiguration={resetPrintConfiguration}
            onPrintReceipt={printReceipt}
          />
        </div>
      </div>
    </Tabs>
  );
};
