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
import { DITHER_CONFIGURATION_QUERY_KEY } from "#lib/data/dither-configuration/constants.ts";
import { useDitherConfiguration } from "#lib/data/dither-configuration/queries.ts";
import { resizeBlobToSquare } from "#lib/image-manipulation/utils.ts";
import { logKioskEvent, toErrorMessage } from "#lib/logging.ts";
import { cn, getBlobDimensions } from "#lib/utils.ts";
import { trpc } from "#trpc/client.ts";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Loader2, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type RefObject,
} from "react";

import {
  DEFAULT_PRINT_CONFIGURATION_FORM_VALUES,
  PRINT_CONFIGURATION_FORM_SCHEMA,
  type PrintConfigurationFormValues,
} from "./internal/PrintConfigurationPanel.constants";

interface PrintConfigurationPanelProps {
  onClose: () => void;
  webcamRef: RefObject<WebcamHandle | null>;
}

type AutosaveStatus = "idle" | "saving" | "saved" | "error";
type PrintConfigurationComparableValues = Omit<
  PrintConfigurationFormValues,
  "ditherModeCode"
> & {
  ditherModeCode: number;
};

const AUTOSAVE_DEBOUNCE_MS = 500;
const SAVED_STATUS_DURATION_MS = 1500;

const getPrintConfigurationSignature = (
  values: PrintConfigurationComparableValues,
) => JSON.stringify(values);

export const PrintConfigurationPanel: FC<PrintConfigurationPanelProps> = ({
  onClose,
  webcamRef,
}) => {
  const [previewSrc, setPreviewSrc] = useState<string>();
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [autosaveError, setAutosaveError] = useState<string>();
  const queryClient = useQueryClient();
  const didHydrateFormRef = useRef(false);
  const isResettingFormRef = useRef(false);
  const hasPersistedConfigurationRef = useRef(false);
  const lastHydratedSignatureRef = useRef<string | undefined>(undefined);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const savedStatusTimeoutRef = useRef<number | undefined>(undefined);
  const queuedSubmitTimeoutRef = useRef<number | undefined>(undefined);

  const { data: ditherConfiguration, isLoading: isLoadingDitherConfiguration } =
    useDitherConfiguration();

  const defaultValues = useMemo(
    () =>
      ditherConfiguration
        ? {
            ditherModeCode: ditherConfiguration.ditherModeCode,
            brightness: ditherConfiguration.brightness,
            contrast: ditherConfiguration.contrast,
            gamma: ditherConfiguration.gamma,
            threshold: ditherConfiguration.threshold,
          }
        : DEFAULT_PRINT_CONFIGURATION_FORM_VALUES,
    [ditherConfiguration],
  );

  const form = useForm({
    defaultValues,
    validators: {
      onChange: PRINT_CONFIGURATION_FORM_SCHEMA,
      onSubmit: PRINT_CONFIGURATION_FORM_SCHEMA,
    },
    listeners: {
      onChangeDebounceMs: AUTOSAVE_DEBOUNCE_MS,
      onChange: async ({ formApi }) => {
        if (isLoadingDitherConfiguration) {
          return;
        }

        await formApi.handleSubmit();
      },
    },
    onSubmit: async (submitted) => {
      const submittedValues = submitted.value;
      const submittedSignature =
        getPrintConfigurationSignature(submittedValues);
      let didSave = false;

      window.clearTimeout(savedStatusTimeoutRef.current);

      try {
        if (hasPersistedConfigurationRef.current) {
          await trpc.updateDitherConfiguration.mutate(submittedValues);
        } else {
          await trpc.createDitherConfiguration.mutate(submittedValues);
          hasPersistedConfigurationRef.current = true;
        }

        lastSavedSignatureRef.current = submittedSignature;
        didSave = true;
        setAutosaveError(undefined);
        setAutosaveStatus("saved");

        void queryClient.invalidateQueries({
          queryKey: [DITHER_CONFIGURATION_QUERY_KEY],
        });

        if (
          getPrintConfigurationSignature(form.state.values) ===
          submittedSignature
        ) {
          isResettingFormRef.current = true;
          form.reset(submittedValues);
          isResettingFormRef.current = false;
        }

        savedStatusTimeoutRef.current = window.setTimeout(() => {
          setAutosaveStatus((currentStatus) =>
            currentStatus === "saved" ? "idle" : currentStatus,
          );
        }, SAVED_STATUS_DURATION_MS);
      } catch (error) {
        setAutosaveStatus("error");
        setAutosaveError(
          toErrorMessage(error, "Saving print configuration failed."),
        );
      } finally {
        if (!didSave) {
          return;
        }

        const latestValues = PRINT_CONFIGURATION_FORM_SCHEMA.safeParse(
          form.state.values,
        );

        if (!latestValues.success) {
          return;
        }

        if (
          getPrintConfigurationSignature(latestValues.data) !==
          lastSavedSignatureRef.current
        ) {
          window.clearTimeout(queuedSubmitTimeoutRef.current);
          queuedSubmitTimeoutRef.current = window.setTimeout(() => {
            setAutosaveError(undefined);
            setAutosaveStatus("saving");
            void form.handleSubmit();
          }, 0);
        }
      }
    },
  });

  useEffect(() => {
    return () => {
      window.clearTimeout(savedStatusTimeoutRef.current);
      window.clearTimeout(queuedSubmitTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (isLoadingDitherConfiguration) {
      return;
    }

    const nextSignature = getPrintConfigurationSignature(defaultValues);
    const currentSignature = getPrintConfigurationSignature(form.state.values);
    const hasUnsavedChanges =
      lastSavedSignatureRef.current !== null &&
      currentSignature !== lastSavedSignatureRef.current;

    if (
      didHydrateFormRef.current &&
      nextSignature === lastHydratedSignatureRef.current
    ) {
      return;
    }

    if (didHydrateFormRef.current && hasUnsavedChanges) {
      return;
    }

    isResettingFormRef.current = true;
    form.reset(defaultValues);
    isResettingFormRef.current = false;
    didHydrateFormRef.current = true;
    lastHydratedSignatureRef.current = nextSignature;
    hasPersistedConfigurationRef.current = Boolean(ditherConfiguration);
    lastSavedSignatureRef.current = ditherConfiguration ? nextSignature : null;
  }, [defaultValues, ditherConfiguration, form, isLoadingDitherConfiguration]);

  const takeSquarePhoto = async () => {
    try {
      if (!webcamRef.current) {
        throw new Error("Camera is not available.");
      }

      const photo = await webcamRef.current.takePhoto().catch(() => {
        console.log("takePhoto failed");
        throw new Error("Take photo failed.");
      });

      const { width, height } = await getBlobDimensions(photo);

      logKioskEvent("info", "web.root", "photo-captured", {
        height,
        width,
      });

      if (width === height) {
        return photo;
      }

      logKioskEvent("info", "web.root", "client-square-resize-requested");

      return await resizeBlobToSquare(photo);
    } catch (e) {
      console.log(e);

      logKioskEvent(
        "error",
        "web.root",
        "take-square-photo-and-get-data-url-failed",
        {
          error: toErrorMessage(
            e,
            "Take square photo and get data URL failed.",
          ),
        },
      );
    }
  };

  const getPreviewSrc = async () => {
    const image = await takeSquarePhoto();

    if (!image) {
      return;
    }

    const res = await trpc.dither.mutate(image);

    return `data:${res.mimeType};base64,${res.data}`;
  };

  const handleUpdatePreview = async () => {
    const previewSrc = await getPreviewSrc();

    if (previewSrc) {
      setPreviewSrc(previewSrc);
    }
  };

  return (
    <Card
      className={cn(
        "max-h-[calc(100dvh-4rem)] w-72 overflow-y-auto bg-card/95 backdrop-blur-sm",
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
        <div className={clsx("flex flex-col gap-4")}>
          {previewSrc ? (
            <img src={previewSrc} alt="Preview" />
          ) : (
            <div
              className={clsx(
                "aspect-square w-full",
                "flex items-center justify-center",
                "bg-black",
              )}
            >
              <p className="text-xs text-muted-foreground">Preview</p>
            </div>
          )}
          <Button className={clsx("self-end")} onClick={handleUpdatePreview}>
            Update preview
          </Button>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
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
                    disabled={isLoadingDitherConfiguration}
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onValueChange={(e) => {
                      if (e) {
                        field.handleChange(e);
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
                      <SelectItem value={1}>Burkes</SelectItem>
                      <SelectItem value={2}>Ordered</SelectItem>
                      <SelectItem value={3}>Floyd-Steinberg</SelectItem>
                      <SelectItem value={4}>Atkinson</SelectItem>
                      <SelectItem value={5}>Stucki</SelectItem>
                      <SelectItem value={6}>Sierra</SelectItem>
                      <SelectItem value={7}>Sierra Lite</SelectItem>
                      <SelectItem value={8}>Jarvis-Judice-Ninke</SelectItem>
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
                      disabled={isLoadingDitherConfiguration}
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
                      disabled={isLoadingDitherConfiguration}
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
                      disabled={isLoadingDitherConfiguration}
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
                      disabled={isLoadingDitherConfiguration}
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
          <form.Subscribe
            selector={(state) => ({
              isTouched: state.isTouched,
              isValid: state.isValid,
              isSubmitting: state.isSubmitting,
            })}
          >
            {(state) => (
              <p
                className="text-right text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {state.isSubmitting || autosaveStatus === "saving"
                  ? "Saving..."
                  : autosaveStatus === "error"
                    ? (autosaveError ?? "Autosave failed.")
                    : state.isTouched && !state.isValid
                      ? "Fix validation errors to save."
                      : autosaveStatus === "saved"
                        ? "Saved"
                        : "Changes save automatically."}
              </p>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
};
