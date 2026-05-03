import type { WebcamHandle } from "#components/misc/Webcam/internal/Webcam.types";

import { Webcam } from "#components/misc/Webcam/index";
import { takeSquarePhotoAndFlipHorizontally } from "#lib/image-manipulation/image-manipulation.utils";
import { useTRPC } from "#lib/trpc/trpc.utils";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { SelectField } from "@dither-booth/ui/fields/SelectField";
import { SliderField } from "@dither-booth/ui/fields/SliderField";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CameraIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type FC } from "react";

import type { PrintConfigurationFormValues } from "./internal/PrintConfiguratio.types";

import {
  PRINT_CONFIGURATION_FORM_AUTOSAVE_DEBOUNCE_MS,
  getPrintConfigurationFormValues,
  PRINT_CONFIGURATION_FORM_SCHEMA,
  PRINT_CONFIGURATION_LOG_SOURCE,
  DITHER_MODE_CODE_FIELD_OPTIONS,
  SLIDER_FIELD_CONFIGS,
} from "./internal/PrintConfiguration.constants";
import { reportPrintConfigurationError } from "./internal/PrintConfiguration.utils";

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

  const generatePreviewDataUrl = useCallback(async () => {
    const image = await takeSquarePhotoAndFlipHorizontally(
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

    if (!image) {
      return;
    }

    const res = await ditherer.mutateAsync(image).catch((e) => {
      reportPrintConfigurationError(
        e,
        "preview-dither-failed",
        "Generate preview failed.",
      );
    });

    if (!res) {
      return;
    }

    return `data:${res.mimeType};base64,${res.data}`;
  }, [ditherer, webcamRef]);

  const refreshPreview = useCallback(async () => {
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

    const previewDataUrl = await generatePreviewDataUrl();

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
  }, [generatePreviewDataUrl, hasTriggeredInitialPreview, previewSrc]);

  const saveAndRefreshPreview = useCallback(
    async (
      submittedValues: PrintConfigurationFormValues,
      options?: { skipPersist?: boolean },
    ) => {
      if (!options?.skipPersist) {
        const persistDitherConfiguration = async (
          submittedValues: PrintConfigurationFormValues,
        ) => {
          try {
            if (ditherConfiguration) {
              await ditherConfigurationUpdater.mutateAsync(submittedValues);
            } else {
              await ditherConfigurationCreator.mutateAsync(submittedValues);
            }
          } catch (e) {
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
          }

          return true;
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

  return (
    <div className={clsx("h-dvh", "p-4", "flex gap-4")}>
      <div className={clsx("relative", "aspect-square h-full")}>
        {hasTriggeredInitialPreview && (
          <PreviewDisplay isDithering={isDithering} previewSrc={previewSrc} />
        )}
        <Webcam
          ref={webcamRef}
          className={clsx("h-full")}
          showPreview={!previewSrc}
        />
        <Button
          onClick={refreshPreview}
          className={clsx("absolute z-10", "top-4", "left-4")}
        >
          <CameraIcon className="size-4" />
        </Button>
      </div>
      <form
        className={clsx("flex flex-col gap-4", "min-w-96")}
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
            disabled={isSliderFieldDisabled}
          />
        ))}
      </form>
    </div>
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
        <img
          src={previewSrc}
          alt="Preview"
          className={clsx("h-full w-full", "-scale-x-100")}
        />
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
