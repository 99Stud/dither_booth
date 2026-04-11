import type { WebcamHandle } from "#components/misc/Webcam/index.tsx";

import { SelectField } from "#components/fields/SelectField/index.tsx";
import { SliderField } from "#components/fields/SliderField/index.tsx";
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
import { Spinner } from "#components/ui/spinner.tsx";
import { takeSquarePhoto } from "#lib/image-manipulation/image-manipulation.utils.ts";
import { useTRPC } from "#lib/trpc/trpc.utils.ts";
import { cn } from "#lib/utils.ts";
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
import { reportPrintConfigurationError } from "./internal/PrintConfigurationPanel.utils";

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

  const trpc = useTRPC();

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

  const ditherer = useMutation(trpc.dither.mutationOptions());
  const { isPending: isDithering } = ditherer;

  const generatePreviewDataUrl = useCallback(async () => {
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

  useEffect(() => {
    if (hasTriggeredInitialPreviewRef.current || isLoadingDitherConfiguration) {
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
