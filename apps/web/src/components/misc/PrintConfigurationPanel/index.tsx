import type {
  CameraStatus,
  WebcamHandle,
} from "#components/misc/Webcam/index.tsx";

import { SelectField } from "#components/fields/SelectField/index.tsx";
import { Button } from "#components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "#components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "#components/ui/dialog.tsx";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "#components/ui/field.tsx";
import { Slider } from "#components/ui/slider.tsx";
import { Spinner } from "#components/ui/spinner.tsx";
import { takeSquarePhoto } from "#lib/image-manipulation/image-manipulation.utils.ts";
import { useTRPC } from "#lib/trpc/trpc.utils.ts";
import { blobToDataUrl, cn } from "#lib/utils.ts";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type RefObject,
} from "react";

import type { PrintConfigurationFormValues } from "#app/PrintConfiguration/internal/PrintConfiguratio.types.ts";

import { NamesEntryEnabledControl } from "#app/PrintConfiguration/internal/NamesEntryEnabledControl.tsx";
import {
  DITHER_MODE_CODE_FIELD_OPTIONS,
  getPrintConfigurationFormValues,
  PRINT_CONFIGURATION_FORM_SCHEMA,
  PRINT_CONFIGURATION_PANEL_LOG_SOURCE,
  SLIDER_FIELD_CONFIGS,
} from "#app/PrintConfiguration/internal/PrintConfiguration.constants.ts";
import { reportPrintConfigurationError } from "#app/PrintConfiguration/internal/PrintConfiguration.utils.ts";

const getSliderValue = (value: number | ReadonlyArray<number>) => {
  return Array.isArray(value) ? value[0] : value;
};

const previewDisplayWrapperClassName = clsx(
  "relative",
  "mx-auto",
  "aspect-square",
  "h-auto",
  "w-full",
  "max-h-[min(420px,42dvh)]",
  "max-w-[min(100%,min(420px,42dvh))]",
  "shrink-0",
  "overflow-hidden",
  "flex items-center justify-center",
  "bg-black",
);

interface PrintConfigurationPanelProps {
  cameraStatus: CameraStatus;
  className?: string;
  onClose: () => void;
  webcamRef: RefObject<WebcamHandle | null>;
}

const MAX_AUTO_PREVIEW_ATTEMPTS = 12;

export const PrintConfigurationPanel: FC<PrintConfigurationPanelProps> = ({
  cameraStatus,
  className,
  onClose,
  webcamRef,
}) => {
  const [previewSrc, setPreviewSrc] = useState<string>();
  const [autoPreviewRetryGate, setAutoPreviewRetryGate] = useState(0);
  const initialAutoPreviewSucceededRef = useRef(false);
  const autoPreviewAttemptCountRef = useRef(0);
  const autoPreviewInFlightRef = useRef(false);

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: ditherConfiguration, isLoading: isLoadingDitherConfiguration } =
    useQuery(trpc.getDitherConfiguration.queryOptions());

  const ditherConfigurationUpdater = useMutation(
    trpc.updateDitherConfiguration.mutationOptions(),
  );
  const { isPending: isUpdatingDitherConfiguration } =
    ditherConfigurationUpdater;

  const ditherConfigurationCreator = useMutation(
    trpc.createDitherConfiguration.mutationOptions(),
  );
  const { isPending: isCreatingDitherConfiguration } =
    ditherConfigurationCreator;

  const ditherPreviewMutation = useMutation(trpc.ditherPreview.mutationOptions());
  const { isPending: isDithering } = ditherPreviewMutation;

  const generatePreviewDataUrl = useCallback(
    async (configuration: PrintConfigurationFormValues) => {
      const image = await takeSquarePhoto(
        PRINT_CONFIGURATION_PANEL_LOG_SOURCE,
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

      const imageDataUrl = await blobToDataUrl(image);

      const res = await ditherPreviewMutation
        .mutateAsync({
          configuration,
          image: imageDataUrl,
        })
        .catch((e) => {
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
    },
    [ditherPreviewMutation, webcamRef],
  );

  const refreshPreview = useCallback(
    async (
      configuration: PrintConfigurationFormValues,
    ): Promise<string | undefined> => {
      const previewDataUrl = await generatePreviewDataUrl(configuration);

      if (previewDataUrl) {
        setPreviewSrc(previewDataUrl);
      }

      return previewDataUrl;
    },
    [generatePreviewDataUrl],
  );

  const persistConfiguration = useCallback(
    async (submittedValues: PrintConfigurationFormValues) => {
      try {
        if (ditherConfiguration) {
          await ditherConfigurationUpdater.mutateAsync(submittedValues);
        } else {
          await ditherConfigurationCreator.mutateAsync(submittedValues);
        }

        await queryClient.invalidateQueries(
          trpc.getDitherConfiguration.queryOptions(),
        );

        return true;
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
    },
    [
      ditherConfiguration,
      ditherConfigurationCreator,
      ditherConfigurationUpdater,
      queryClient,
      trpc,
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
    onSubmit: async (submitted) => {
      const ok = await persistConfiguration(submitted.value);
      if (ok) {
        await refreshPreview(submitted.value);
      }
    },
  });

  useEffect(() => {
    if (
      previewSrc ||
      initialAutoPreviewSucceededRef.current ||
      isLoadingDitherConfiguration
    ) {
      return;
    }

    const cameraOk =
      cameraStatus === "ready" ||
      webcamRef.current?.cameraState.status === "ready";

    if (!cameraOk) {
      return;
    }

    if (isDithering || autoPreviewInFlightRef.current) {
      return;
    }

    if (autoPreviewAttemptCountRef.current >= MAX_AUTO_PREVIEW_ATTEMPTS) {
      return;
    }

    autoPreviewInFlightRef.current = true;
    autoPreviewAttemptCountRef.current += 1;

    const configuration = getPrintConfigurationFormValues(ditherConfiguration);

    void (async () => {
      try {
        const url = await refreshPreview(configuration);

        if (url) {
          initialAutoPreviewSucceededRef.current = true;
        } else if (autoPreviewAttemptCountRef.current < MAX_AUTO_PREVIEW_ATTEMPTS) {
          setAutoPreviewRetryGate((g) => g + 1);
        }
      } finally {
        autoPreviewInFlightRef.current = false;
      }
    })();
  }, [
    autoPreviewRetryGate,
    cameraStatus,
    ditherConfiguration,
    isDithering,
    isLoadingDitherConfiguration,
    previewSrc,
    refreshPreview,
  ]);

  return (
    <Card
      className={cn(
        "flex min-h-0 max-h-full flex-col overflow-y-auto overflow-x-hidden",
        "bg-card/95 backdrop-blur-sm",
        className,
      )}
    >
      <CardHeader className="border-b">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <CardTitle>Print Config</CardTitle>
          {isLoadingDitherConfiguration && (
            <>
              <Spinner />
              <span className="sr-only text-xs text-muted-foreground">
                Loading...
              </span>
            </>
          )}
        </div>
        <CardAction>
          <Button variant="ghost" size="icon-xs" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent
        className={clsx(
          "flex min-h-0 flex-col gap-4",
          "border-t-0 pt-0",
        )}
      >
        <div className="flex w-full shrink-0 justify-center">
          <Dialog>
            <DialogTrigger
              className={clsx(
                previewDisplayWrapperClassName,
                "block cursor-pointer",
              )}
            >
              <PreviewDisplay
                isDithering={isDithering}
                previewSrc={previewSrc}
              />
            </DialogTrigger>
            <DialogContent className={clsx("max-w-[calc(100dvh-2rem)]!")}>
              <div className={previewDisplayWrapperClassName}>
                <PreviewDisplay
                  isDithering={isDithering}
                  previewSrc={previewSrc}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <form
          className={clsx(
            "relative z-10 flex flex-col gap-4",
            "bg-card",
          )}
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <SelectField
            form={form}
            name="ditherModeCode"
            label="Dither mode"
            placeholder="Select a dither mode"
            options={DITHER_MODE_CODE_FIELD_OPTIONS}
            disabled={isSelectFieldDisabled}
          />
          <form.Field name="namesEntryEnabled">
            {(field) => (
              <NamesEntryEnabledControl
                inputId={field.name}
                checked={field.state.value}
                onCheckedChange={(v) => {
                  field.handleChange(v);
                }}
                disabled={isPersistingDitherConfiguration}
              />
            )}
          </form.Field>
          {SLIDER_FIELD_CONFIGS.map((sliderField) => (
            <form.Field
              key={sliderField.name}
              name={sliderField.name}
              // oxlint-disable-next-line react/no-children-prop
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field orientation="responsive" data-invalid={isInvalid}>
                    <FieldContent>
                      <FieldLabel htmlFor={field.name}>
                        {sliderField.label}
                      </FieldLabel>
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </FieldContent>
                    <div className="flex items-center gap-2">
                      <Slider
                        disabled={isSliderFieldDisabled}
                        min={sliderField.min}
                        max={sliderField.max}
                        step={sliderField.step}
                        value={[field.state.value]}
                        onValueChange={(value) => {
                          field.handleChange(getSliderValue(value));
                        }}
                      />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {sliderField.formatValue(field.state.value)}
                      </span>
                    </div>
                  </Field>
                );
              }}
            />
          ))}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              disabled={
                isLoadingDitherConfiguration ||
                isDithering ||
                cameraStatus !== "ready"
              }
              variant="outline"
              size="default"
              onClick={() => {
                void refreshPreview(
                  form.state.values as PrintConfigurationFormValues,
                );
              }}
            >
              Preview
            </Button>
            <Button
              type="submit"
              disabled={isPersistingDitherConfiguration}
              size="default"
            >
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
          "absolute",
          "h-full w-full",
          "transition-all",
          isDithering && "bg-card/05 backdrop-blur-xs",
        )}
      />
      {isDithering && <Spinner className="absolute z-10" />}
      <img
        src={previewSrc}
        alt="Preview"
        className="h-full w-full object-contain"
      />
    </>
  ) : (
    <Spinner className="text-white" />
  );
};
