import type { WebcamHandle } from "#components/misc/Webcam/index.tsx";

import { Button } from "#components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "#components/ui/card.tsx";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "#components/ui/field.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select.tsx";
import { Slider } from "#components/ui/slider.tsx";
import { takeSquarePhoto } from "#lib/image-manipulation/utils.ts";
import { reportKioskError } from "#lib/logging.ts";
import { cn } from "#lib/utils.ts";
import { useTRPC } from "#trpc/utils.ts";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Loader2, X } from "lucide-react";
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
  DITHER_MODE_CODE_LABELS,
  getPrintConfigurationFormValues,
  PRINT_CONFIGURATION_FORM_SCHEMA,
  PRINT_CONFIGURATION_PANEL_ERROR_SOURCE,
} from "./internal/PrintConfigurationPanel.constants";

interface PrintConfigurationPanelProps {
  className?: string;
  onClose: () => void;
  webcamRef: RefObject<WebcamHandle | null>;
}

const reportPrintConfigurationError = (
  error: unknown,
  event: string,
  fallback: string,
) => {
  return reportKioskError(error, {
    event,
    fallback,
    source: PRINT_CONFIGURATION_PANEL_ERROR_SOURCE,
  });
};

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
    const image = await takeSquarePhoto(async () => {
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
        "max-h-[calc(100dvh-4rem)] w-96 overflow-y-auto bg-card/95 backdrop-blur-sm",
        className,
      )}
    >
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <CardTitle>Print Config</CardTitle>
          {isLoadingDitherConfiguration && (
            <>
              <Loader2 className="size-3.5 animate-spin" />
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
      <CardContent>
        <div className={clsx("flex flex-col gap-4", "mb-4")}>
          {previewSrc ? (
            <div className={clsx("relative", "aspect-square w-full")}>
              <div
                className={clsx(
                  "absolute",
                  "h-full w-full",
                  "transition-all",
                  isDithering && "bg-card/05 backdrop-blur-xs",
                )}
              />
              <img src={previewSrc} alt="Preview" />
            </div>
          ) : (
            <div
              className={clsx(
                "aspect-square w-full",
                "flex items-center justify-center",
                "bg-black",
              )}
            >
              <p className="text-xs text-muted-foreground">
                Preview loading...
              </p>
            </div>
          )}
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <form.Field
            name="ditherModeCode"
            // oxlint-disable-next-line react/no-children-prop
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field orientation="responsive" data-invalid={isInvalid}>
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>Dither Mode</FieldLabel>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </FieldContent>
                  <Select
                    disabled={
                      isLoadingDitherConfiguration ||
                      isUpdatingDitherConfiguration ||
                      isCreatingDitherConfiguration
                    }
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (value != null) {
                        field.handleChange(value);
                      }
                    }}
                  >
                    <SelectTrigger
                      className={clsx("min-w-[120px]")}
                      aria-invalid={isInvalid}
                      id={field.name}
                    >
                      <SelectValue placeholder="Select a dither mode" />
                    </SelectTrigger>
                    <SelectContent>
                      {DITHER_MODE_CODE_LABELS.map((ditherMode) => (
                        <SelectItem
                          key={ditherMode.value}
                          value={ditherMode.value}
                        >
                          {ditherMode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              );
            }}
          />
          <form.Field
            name="brightness"
            // oxlint-disable-next-line react/no-children-prop
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field orientation="responsive" data-invalid={isInvalid}>
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>Brightness</FieldLabel>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </FieldContent>
                  <div className="flex items-center gap-2">
                    <Slider
                      disabled={
                        isLoadingDitherConfiguration ||
                        isUpdatingDitherConfiguration ||
                        isCreatingDitherConfiguration
                      }
                      min={0}
                      max={3}
                      step={0.05}
                      value={[field.state.value]}
                      onValueChange={(v) => {
                        if (Array.isArray(v)) {
                          field.handleChange(v[0]);
                        } else {
                          field.handleChange(v as number);
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {field.state.value.toFixed(2)}
                    </span>
                  </div>
                </Field>
              );
            }}
          />
          <form.Field
            name="contrast"
            // oxlint-disable-next-line react/no-children-prop
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field orientation="responsive" data-invalid={isInvalid}>
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>Contrast</FieldLabel>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </FieldContent>
                  <div className="flex items-center gap-2">
                    <Slider
                      disabled={
                        isLoadingDitherConfiguration ||
                        isUpdatingDitherConfiguration ||
                        isCreatingDitherConfiguration
                      }
                      min={0}
                      max={3}
                      step={0.05}
                      value={[field.state.value]}
                      onValueChange={(v) => {
                        if (Array.isArray(v)) {
                          field.handleChange(v[0]);
                        } else {
                          field.handleChange(v as number);
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {field.state.value.toFixed(2)}
                    </span>
                  </div>
                </Field>
              );
            }}
          />
          <form.Field
            name="gamma"
            // oxlint-disable-next-line react/no-children-prop
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field orientation="responsive" data-invalid={isInvalid}>
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>Gamma</FieldLabel>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </FieldContent>
                  <div className="flex items-center gap-2">
                    <Slider
                      disabled={
                        isLoadingDitherConfiguration ||
                        isUpdatingDitherConfiguration ||
                        isCreatingDitherConfiguration
                      }
                      min={1}
                      max={3}
                      step={0.05}
                      value={[field.state.value]}
                      onValueChange={(v) => {
                        if (Array.isArray(v)) {
                          field.handleChange(v[0]);
                        } else {
                          field.handleChange(v as number);
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {field.state.value.toFixed(2)}
                    </span>
                  </div>
                </Field>
              );
            }}
          />
          <form.Field
            name="threshold"
            // oxlint-disable-next-line react/no-children-prop
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field orientation="responsive" data-invalid={isInvalid}>
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>Threshold</FieldLabel>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </FieldContent>
                  <div className="flex items-center gap-2">
                    <Slider
                      disabled={
                        isLoadingDitherConfiguration ||
                        isUpdatingDitherConfiguration ||
                        isCreatingDitherConfiguration
                      }
                      min={0}
                      max={255}
                      step={1}
                      value={[field.state.value]}
                      onValueChange={(v) => {
                        if (Array.isArray(v)) {
                          field.handleChange(v[0]);
                        } else {
                          field.handleChange(v as number);
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {field.state.value}
                    </span>
                  </div>
                </Field>
              );
            }}
          />
        </form>
      </CardContent>
    </Card>
  );
};
