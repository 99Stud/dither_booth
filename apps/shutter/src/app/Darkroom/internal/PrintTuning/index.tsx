import type { WebcamHandle } from "@dither-booth/ui/components/misc/Webcam";
import type { ReactNode } from "react";

import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
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
import { Contrast, ReceiptText, SlidersHorizontal } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";

import { SHUTTER_CAMERA_LOG_SOURCE } from "#lib/constants";
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
} = createUserMediaReporters({ source: SHUTTER_CAMERA_LOG_SOURCE });

/**
 * The print tuning screen, moved from admin: camera preview, dithering and
 * receipt previews, the settings form (autosaved) and a test print.
 * `renderHeader` places the Dithering / Receipt tabs in the Darkroom header.
 */
export const PrintTuning = ({
  renderHeader,
}: {
  renderHeader: (tabs: ReactNode) => ReactNode;
}) => {
  const webcamRef = useRef<WebcamHandle>(null);

  const trpc = useTRPC();

  const printConfigurationQueryOptions =
    trpc.config.getPrintConfiguration.queryOptions();
  const { data: printConfiguration, isLoading: isLoadingPrintConfiguration } =
    useQuery(printConfigurationQueryOptions);

  const {
    mutateAsync: updatePrintConfiguration,
    isPending: isUpdatingPrintConfiguration,
  } = useMutation({
    ...trpc.config.updatePrintConfiguration.mutationOptions(),
    scope: { id: "print-configuration-save" },
  });

  const { mutateAsync: ditherPhoto, isPending: isDithering } = useMutation(
    trpc.config.dither.mutationOptions(),
  );

  const { mutateAsync: printReceiptImage, isPending: isPrintingReceipt } =
    useMutation(trpc.config.printReceipt.mutationOptions());

  const { mutateAsync: generateReceiptImage, isPending: isGeneratingReceipt } =
    useMutation(trpc.config.generateReceipt.mutationOptions());

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
      {renderHeader(
        <TabsList className={clsx("h-10! w-full md:w-auto")}>
          <TabsTrigger value="dithering" className={clsx("px-4")}>
            <Contrast />
            Dithering
          </TabsTrigger>
          <TabsTrigger value="receipt" className={clsx("px-4")}>
            <ReceiptText />
            Receipt
          </TabsTrigger>
        </TabsList>,
      )}
      <div
        className={clsx(
          // Landscape iPad: preview and settings side by side; portrait and
          // smaller: stacked, the page scrolls.
          "grid gap-4 p-4 lg:p-6",
          "lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]",
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
        <Card
          className={clsx(
            "gap-0 py-0",
            // Landscape: the card fills the height and scrolls inside, so
            // Reset and Test print stay on screen.
            "lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8.5rem)] lg:self-start",
          )}
        >
          <CardHeader className={clsx("border-b py-4")}>
            <CardTitle className={clsx("flex items-center gap-2.5")}>
              <IconBubble tone="brand">
                <SlidersHorizontal />
              </IconBubble>
              Print settings
            </CardTitle>
            <CardDescription>Saved as you change them.</CardDescription>
          </CardHeader>
          <form
            className={clsx("min-h-0 flex-1 overflow-y-auto px-4 py-4")}
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
          <CardFooter className={clsx("border-t bg-muted/40 py-3")}>
            <PrintConfigurationActions
              isResetDisabled={isPersistingPrintConfiguration}
              isPrintReceiptDisabled={
                isPersistingPrintConfiguration || isPrintingReceipt
              }
              isPrintingReceipt={isPrintingReceipt}
              onResetConfiguration={resetPrintConfiguration}
              onPrintReceipt={printReceipt}
            />
          </CardFooter>
        </Card>
      </div>
    </Tabs>
  );
};
