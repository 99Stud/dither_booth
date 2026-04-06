import type { WebcamHandle } from "#components/misc/Webcam/index.tsx";

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
import { takeSquarePhoto } from "#lib/image-manipulation/utils.ts";
import { reportKioskError } from "#lib/logging.ts";
import { cn } from "#lib/utils.ts";
import { useTRPC } from "#trpc/utils.ts";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
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

import type { PrintConfigurationFormValues } from "./internal/PrintConfigurationPanel.types";

import {
  AUTOSAVE_DEBOUNCE_MS,
  DITHER_MODE_CODE_FIELD_OPTIONS,
  getPrintConfigurationFormValues,
  PRINT_CONFIGURATION_FORM_SCHEMA,
  PRINT_CONFIGURATION_PANEL_LOG_SOURCE,
  SLIDER_FIELD_CONFIGS,
} from "./internal/PrintConfigurationPanel.constants";

const reportPrintConfigurationError = (
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

const getSliderValue = (value: number | ReadonlyArray<number>) => {
  return Array.isArray(value) ? value[0] : value;
};

const previewDisplayWrapperClassName = clsx(
  "relative",
  "aspect-square",
  "overflow-hidden",
  "flex items-center justify-center",
  "bg-black",
);

interface PrintConfigurationPanelProps {
  className?: string;
  onClose: () => void;
  webcamRef: RefObject<WebcamHandle | null>;
}

export const PrintConfigurationPanel: FC<PrintConfigurationPanelProps> = ({
  className,
  onClose,
  webcamRef,
}) => {
  const [previewSrc, setPreviewSrc] = useState<string>();
  const hasTriggeredInitialPreviewRef = useRef(false);
  const lastLoadErrorRef = useRef<string | null>(null);

  const trpc = useTRPC();

  const {
    data: ditherConfiguration,
    error: ditherConfigurationError,
    isError: hasDitherConfigurationError,
    isLoading: isLoadingDitherConfiguration,
  } = useQuery(trpc.getDitherConfiguration.queryOptions());

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

  const ditherer = useMutation(trpc.dither.mutationOptions());
  const { isPending: isDithering } = ditherer;

  useEffect(() => {
    if (!hasDitherConfigurationError) {
      lastLoadErrorRef.current = null;
      return;
    }

    const errorMessage =
      ditherConfigurationError instanceof Error
        ? ditherConfigurationError.message
        : "Load dither configuration failed.";

    if (lastLoadErrorRef.current === errorMessage) {
      return;
    }

    lastLoadErrorRef.current = errorMessage;
    reportPrintConfigurationError(
      ditherConfigurationError,
      "load-dither-configuration-failed",
      "Load dither configuration failed.",
    );
  }, [ditherConfigurationError, hasDitherConfigurationError]);

  const generatePreviewDataUrl = useCallback(async () => {
    const image = await takeSquarePhoto(PRINT_CONFIGURATION_PANEL_LOG_SOURCE, async () => {
      if (!webcamRef.current) {
        throw new Error("Camera is not available.");
      }

      return await webcamRef.current.takePhoto();
    }).catch((e) => {
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
    const previewDataUrl = await generatePreviewDataUrl();

    if (previewDataUrl) {
      setPreviewSrc(previewDataUrl);
    }
  }, [generatePreviewDataUrl]);

  const persistDitherConfiguration = useCallback(
    async (submittedValues: PrintConfigurationFormValues) => {
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
    },
    [
      ditherConfiguration,
      ditherConfigurationCreator,
      ditherConfigurationUpdater,
    ],
  );

  const saveAndRefreshPreview = useCallback(
    async (
      submittedValues: PrintConfigurationFormValues,
      options?: { skipPersist?: boolean },
    ) => {
      if (!options?.skipPersist) {
        const wasPersisted = await persistDitherConfiguration(submittedValues);

        if (!wasPersisted) {
          return;
        }
      }

      await refreshPreview();
    },
    [persistDitherConfiguration, refreshPreview],
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

  useEffect(() => {
    if (
      hasTriggeredInitialPreviewRef.current ||
      isLoadingDitherConfiguration ||
      hasDitherConfigurationError
    ) {
      return;
    }

    hasTriggeredInitialPreviewRef.current = true;

    void saveAndRefreshPreview(
      getPrintConfigurationFormValues(ditherConfiguration),
      {
        skipPersist: ditherConfiguration != null,
      },
    );
  }, [
    ditherConfiguration,
    hasDitherConfigurationError,
    isLoadingDitherConfiguration,
    saveAndRefreshPreview,
  ]);

  const form = useForm({
    defaultValues,
    validators: {
      onChange: PRINT_CONFIGURATION_FORM_SCHEMA,
      onSubmit: PRINT_CONFIGURATION_FORM_SCHEMA,
    },
    listeners: {
      onChangeDebounceMs: AUTOSAVE_DEBOUNCE_MS,
      onChange: async () => {
        form.handleSubmit();
      },
    },
    onSubmit: async (submitted) => {
      await saveAndRefreshPreview(submitted.value);
    },
  });

  return (
    <Card
      className={cn(
        "h-[calc(100dvh-4rem)] bg-card/95 backdrop-blur-sm",
        className,
      )}
    >
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
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
          "h-[calc(100%-57.5px)]",
          "grid grid-rows-[auto_min-content] gap-4",
        )}
      >
        <Dialog>
          <DialogTrigger
            className={clsx(previewDisplayWrapperClassName, "cursor-pointer")}
          >
            <PreviewDisplay isDithering={isDithering} previewSrc={previewSrc} />
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
            options={DITHER_MODE_CODE_FIELD_OPTIONS}
            disabled={isSelectFieldDisabled}
          />
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
      <img src={previewSrc} alt="Preview" className="h-full w-full" />
    </>
  ) : (
    <Spinner className="text-white" />
  );
};
