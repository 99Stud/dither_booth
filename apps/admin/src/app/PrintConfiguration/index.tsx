import { base64ToBlob, downloadBlob } from "@dither-booth/shared/browser/blob";
import {
  Webcam,
  type WebcamHandle,
} from "@dither-booth/ui/components/misc/Webcam";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { SelectField } from "@dither-booth/ui/fields/SelectField";
import { SliderField } from "@dither-booth/ui/fields/SliderField";
import { SwitchField } from "@dither-booth/ui/fields/SwitchField";
import { createUserMediaReporters } from "@dither-booth/ui/lib/hooks/user-media";
import { takeSquarePhotoAndFlipHorizontally } from "@dither-booth/ui/lib/image-manipulation";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { format } from "date-fns";
import { CameraIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type FC } from "react";

import { AppSidebarPageHeader } from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";
import { ADMIN_CAMERA_LOG_SOURCE } from "#lib/constants";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

import type { PrintConfigurationFormValues } from "./internal/PrintConfiguration.types";

import {
  PRINT_CONFIGURATION_FORM_AUTOSAVE_DEBOUNCE_MS,
  getPrintConfigurationFormValues,
  PRINT_CONFIGURATION_FORM_SCHEMA,
  PRINT_CONFIGURATION_LOG_SOURCE,
  DITHER_MODE_CODE_FIELD_OPTIONS,
  COLOR_SCHEME_CODE_FIELD_OPTIONS,
  SLIDER_FIELD_CONFIGS,
  DEFAULT_PRINT_CONFIGURATION_FORM_VALUES,
} from "./internal/PrintConfiguration.constants";
import { reportPrintConfigurationError } from "./internal/PrintConfiguration.utils";

const {
  reportUserMediaCameraStateChange,
  reportUserMediaConstraintFallbackError,
} = createUserMediaReporters({ source: ADMIN_CAMERA_LOG_SOURCE });

export const PrintConfiguration = () => {
  const webcamRef = useRef<WebcamHandle>(null);
  const latestPreviewRequestIdRef = useRef(0);

  const [previewSrc, setPreviewSrc] = useState<string>();
  const [hasTriggeredInitialPreview, setHasTriggeredInitialPreview] =
    useState(false);

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const ditherConfigurationQueryOptions =
    trpc.getDitherConfiguration.queryOptions();
  const { data: ditherConfiguration, isLoading: isLoadingDitherConfiguration } =
    useQuery(ditherConfigurationQueryOptions);

  const ditherConfigurationUpdater = useMutation(
    trpc.updateDitherConfiguration.mutationOptions(),
  );
  const { isPending: isUpdatingDitherConfiguration } =
    ditherConfigurationUpdater;

  const ditherConfigurationCreator = useMutation(
    trpc.createDitherConfiguration.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ditherConfigurationQueryOptions.queryKey,
        });
      },
    }),
  );
  const { isPending: isCreatingDitherConfiguration } =
    ditherConfigurationCreator;

  const ditherer = useMutation(trpc.dither.mutationOptions());
  const { isPending: isDithering } = ditherer;

  const receiptPrinter = useMutation(trpc.printReceipt.mutationOptions());
  const { isPending: isPrintingReceipt } = receiptPrinter;

  const generatePreviewDataUrl = useCallback(
    async (download: boolean = false) => {
      const squarePhoto = await takeSquarePhotoAndFlipHorizontally(
        PRINT_CONFIGURATION_LOG_SOURCE,
        async () => {
          if (!webcamRef.current) {
            throw new Error("Camera is not available.");
          }

          return await webcamRef.current.takePhoto();
        },
      ).catch((e) => {
        reportPrintConfigurationError(
          e,
          "preview-photo-capture-failed",
          "Take square photo failed.",
        );
      });

      if (!squarePhoto) {
        return;
      }

      const ditheredSquarePhoto = await ditherer
        .mutateAsync(squarePhoto)
        .catch((e) => {
          reportPrintConfigurationError(
            e,
            "preview-dither-failed",
            "Generate preview failed.",
          );
        });

      if (!ditheredSquarePhoto) {
        return;
      }

      if (download) {
        const blob = base64ToBlob(
          ditheredSquarePhoto.data,
          ditheredSquarePhoto.mimeType,
        );
        downloadBlob(
          blob,
          `preview-${format(new Date(), "MM_dd_yyyy_HH_mm_ss")}.webp`,
        );
      }

      return `data:${ditheredSquarePhoto.mimeType};base64,${ditheredSquarePhoto.data}`;
    },
    [ditherer, webcamRef],
  );

  const refreshPreview = useCallback(
    async (download: boolean = false) => {
      const requestId = latestPreviewRequestIdRef.current + 1;
      latestPreviewRequestIdRef.current = requestId;

      if (!hasTriggeredInitialPreview) {
        setHasTriggeredInitialPreview(true);
      }

      if (webcamRef.current?.cameraState.status !== "ready") {
        if (!previewSrc) {
          setHasTriggeredInitialPreview(false);
        }

        return;
      }

      const previewDataUrl = await generatePreviewDataUrl(download);

      if (requestId !== latestPreviewRequestIdRef.current) {
        return;
      }

      if (!previewDataUrl) {
        if (!previewSrc) {
          setHasTriggeredInitialPreview(false);
        }

        return;
      }

      if (previewDataUrl) {
        setPreviewSrc(previewDataUrl);
      }
    },
    [generatePreviewDataUrl, hasTriggeredInitialPreview, previewSrc],
  );

  const saveAndRefreshPreview = useCallback(
    async (
      submittedValues: PrintConfigurationFormValues,
      options?: { skipPersist?: boolean },
    ) => {
      if (!options?.skipPersist) {
        const persistDitherConfiguration = async (
          submittedValues: PrintConfigurationFormValues,
        ) => {
          const ditherConfigurationPersistence = ditherConfiguration
            ? ditherConfigurationUpdater.mutateAsync(submittedValues)
            : ditherConfigurationCreator.mutateAsync(submittedValues);

          return await ditherConfigurationPersistence
            .then(() => true)
            .catch((e) => {
              reportPrintConfigurationError(
                e,
                ditherConfiguration
                  ? "update-dither-configuration-failed"
                  : "create-dither-configuration-failed",
                ditherConfiguration
                  ? "Update dither configuration failed."
                  : "Create dither configuration failed.",
              );
              return false;
            });
        };

        const wasPersisted = await persistDitherConfiguration(submittedValues);

        if (!wasPersisted) {
          return;
        }
      }

      await refreshPreview();
    },
    [
      refreshPreview,
      ditherConfiguration,
      ditherConfigurationCreator,
      ditherConfigurationUpdater,
    ],
  );

  const defaultValues = useMemo<PrintConfigurationFormValues>(
    () => getPrintConfigurationFormValues(ditherConfiguration),
    [ditherConfiguration],
  );
  const isPersistingDitherConfiguration =
    isLoadingDitherConfiguration ||
    isUpdatingDitherConfiguration ||
    isCreatingDitherConfiguration;
  const isSelectFieldDisabled = isPersistingDitherConfiguration || isDithering;
  const isSwitchFieldDisabled = isPersistingDitherConfiguration;
  const isSliderFieldDisabled = isPersistingDitherConfiguration;

  const form = useForm({
    defaultValues,
    validators: {
      onChange: PRINT_CONFIGURATION_FORM_SCHEMA,
      onSubmit: PRINT_CONFIGURATION_FORM_SCHEMA,
    },
    listeners: {
      onChangeDebounceMs: PRINT_CONFIGURATION_FORM_AUTOSAVE_DEBOUNCE_MS,
      onChange: async () => {
        form.handleSubmit();
      },
    },
    onSubmit: async (submitted) => {
      await saveAndRefreshPreview(submitted.value);
    },
  });

  const generateReceipt = useMutation(trpc.generateReceipt.mutationOptions());
  const { isPending: isGeneratingReceipt } = generateReceipt;

  const downloadReceipt = async () => {
    try {
      const squarePhoto = await takeSquarePhotoAndFlipHorizontally(
        PRINT_CONFIGURATION_LOG_SOURCE,
        async () => {
          if (!webcamRef.current) {
            throw new Error("Camera is not available.");
          }

          return await webcamRef.current.takePhoto();
        },
      );

      if (!squarePhoto) {
        throw new Error("Square photo is not available.");
      }

      const receipt = await generateReceipt.mutateAsync(squarePhoto);

      const receiptBlob = base64ToBlob(receipt.data, receipt.mimeType);

      downloadBlob(
        receiptBlob,
        `receipt-${format(new Date(), "MM_dd_yyyy_HH_mm_ss")}.png`,
      );
    } catch (e) {
      reportKioskError(e, {
        event: "generate-receipt-failed",
        source: PRINT_CONFIGURATION_LOG_SOURCE,
        userMessage: "Generate receipt failed.",
      });
    }
  };

  const printReceipt = async () => {
    try {
      const squarePhoto = await takeSquarePhotoAndFlipHorizontally(
        PRINT_CONFIGURATION_LOG_SOURCE,
        async () => {
          if (!webcamRef.current) {
            throw new Error("Camera is not available.");
          }

          return await webcamRef.current.takePhoto();
        },
      );

      if (!squarePhoto) {
        throw new Error("Square photo is not available.");
      }

      const receipt = await receiptPrinter.mutateAsync(squarePhoto);

      console.log(receipt);
    } catch (e) {
      reportKioskError(e, {
        event: "print-receipt-failed",
        source: PRINT_CONFIGURATION_LOG_SOURCE,
        userMessage: "Print receipt failed.",
      });
    }
  };

  return (
    <>
      <AppSidebarPageHeader title="Print configuration" />
      <div
        className={clsx(
          "h-[calc(100dvh-4rem)] group-has-data-[collapsible=icon]/sidebar-wrapper:h-[calc(100dvh-3rem)]",
          "pr-2 pb-2",
          "flex gap-2",
        )}
      >
        <div className={clsx("relative", "aspect-square h-full")}>
          {hasTriggeredInitialPreview && (
            <PreviewDisplay isDithering={isDithering} previewSrc={previewSrc} />
          )}
          <Webcam
            ref={webcamRef}
            className={clsx("h-full")}
            onCameraStateChange={reportUserMediaCameraStateChange}
            onConstraintFallbackError={reportUserMediaConstraintFallbackError}
            showPreview={!previewSrc}
          />
          <Button
            onClick={() => refreshPreview()}
            className={clsx("absolute z-10", "top-4", "left-4")}
          >
            <CameraIcon className="size-4" />
          </Button>
        </div>
        <div className={clsx("flex-1", "flex flex-col justify-between gap-2")}>
          <form
            className={clsx("flex flex-col gap-4")}
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <SelectField
              form={form}
              name="ditherModeCode"
              label="Dither Mode"
              placeholder="Select a dither mode"
              options={DITHER_MODE_CODE_FIELD_OPTIONS}
              disabled={isSelectFieldDisabled}
            />
            <SelectField
              form={form}
              name="colorSchemeCode"
              label="Color Scheme"
              placeholder="Select a color scheme"
              options={COLOR_SCHEME_CODE_FIELD_OPTIONS}
              disabled={isSelectFieldDisabled}
            />
            <SwitchField
              form={form}
              name="serpentine"
              label="Serpentine"
              disabled={isSwitchFieldDisabled}
            />
            {SLIDER_FIELD_CONFIGS.map((sliderField) => (
              <SliderField
                key={sliderField.name}
                form={form}
                name={sliderField.name}
                label={sliderField.label}
                min={sliderField.min}
                max={sliderField.max}
                step={sliderField.step}
                formatValue={sliderField.formatValue}
                sliderValueToValue={sliderField.sliderValueToValue}
                valueToSliderValue={sliderField.valueToSliderValue}
                disabled={isSliderFieldDisabled}
              />
            ))}
            <Button
              type="submit"
              onClick={() => {
                form.reset(DEFAULT_PRINT_CONFIGURATION_FORM_VALUES);
              }}
            >
              Reset
            </Button>
          </form>
          <div className={clsx("flex flex-col gap-2")}>
            <Button onClick={() => refreshPreview(true)}>
              {isDithering ? (
                <>
                  Dithering&nbsp;
                  <Spinner className="size-4" />
                </>
              ) : (
                "Download raw preview"
              )}
            </Button>
            <Button onClick={downloadReceipt}>
              {isGeneratingReceipt ? (
                <>
                  Generating receipt&nbsp;
                  <Spinner className="size-4" />
                </>
              ) : (
                "Download receipt"
              )}
            </Button>
            <Button onClick={printReceipt}>
              {isPrintingReceipt ? (
                <>
                  Printing receipt&nbsp;
                  <Spinner className="size-4" />
                </>
              ) : (
                "Print receipt"
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

interface PreviewDisplayProps {
  isDithering: boolean;
  previewSrc?: string;
}

const PreviewDisplay: FC<PreviewDisplayProps> = ({
  isDithering,
  previewSrc,
}) => {
  return previewSrc ? (
    <>
      <div
        className={clsx(
          "absolute z-10",
          "h-full w-full",
          "transition-all",
          isDithering && "bg-card/05 backdrop-blur-xs",
        )}
      />
      {isDithering && (
        <Spinner
          className={clsx(
            "absolute inset-0 z-10",
            "m-auto",
            "text-white",
            "size-6",
          )}
        />
      )}
      {previewSrc && (
        <img src={previewSrc} alt="Preview" className={clsx("h-full w-full")} />
      )}
    </>
  ) : (
    <div
      className={clsx(
        "absolute z-10",
        "h-full w-full",
        "flex items-center justify-center",
        "bg-card/05 backdrop-blur-xs",
      )}
    >
      <Spinner className="text-white" />
    </div>
  );
};
