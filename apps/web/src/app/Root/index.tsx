import { PrintDebugPanel } from "#components/misc/PrintDebugPanel.tsx";
import { Webcam, type WebcamHandle } from "#components/misc/Webcam/index.tsx";
import { Button } from "#components/ui/button.tsx";
import { logKioskEvent, toErrorMessage } from "#lib/logging.ts";
import {
  PRINT_DEBUG_DEFAULTS,
  arePrintDebugParamsEqual,
  loadSavedPrintDebugParams,
  savePrintDebugParams,
  type PrintDebugParams,
} from "#lib/print-config.ts";
import { ENABLE_PRINT_DEBUG_PANEL } from "#lib/public-env.ts";
import { base64ToBlob } from "#lib/trpc/utils.ts";
import { blobToDataUrl, downloadBlob } from "#lib/utils.ts";
import { trpc } from "#trpc/client.ts";
import { isTRPCClientError } from "#trpc/utils.ts";
import {
  type FC,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

const ENABLE_DEBUG_PANEL = ENABLE_PRINT_DEBUG_PANEL;
const CONFIG_ENTRY_TAP_COUNT = 5;
const CONFIG_ENTRY_WINDOW_MS = 1500;
const PREVIEW_DEBOUNCE_MS = 250;

const getBlobDimensions = async (blob: Blob) => {
  const imageBitmap = await createImageBitmap(blob);

  try {
    return {
      width: imageBitmap.width,
      height: imageBitmap.height,
    };
  } finally {
    imageBitmap.close();
  }
};

const captureImage = async (
  webcamRef: RefObject<WebcamHandle | null>,
): Promise<string | undefined> => {
  if (!webcamRef.current) {
    toast.error("Camera is not available.");
    return undefined;
  }

  const photo = await webcamRef.current.takePhoto();
  const { width, height } = await getBlobDimensions(photo);

  if (width === height) {
    return blobToDataUrl(photo);
  }

  const resizedPhoto = await trpc.squareResize.mutate(photo).catch((e) => {
    if (isTRPCClientError(e)) {
      toast.error(e.message);
    }
    logKioskEvent("error", "web.root", "square-resize-failed", {
      error: toErrorMessage(e, "Square resize failed."),
    });
  });

  if (!resizedPhoto) {
    return undefined;
  }

  return `data:${resizedPhoto.mimeType};base64,${resizedPhoto.data}`;
};

export const Root: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);
  const configEntryTapRef = useRef({
    count: 0,
    lastTapAt: 0,
  });

  const [debugOpen, setDebugOpen] = useState(false);
  const [savedDebugParams, setSavedDebugParams] =
    useState<PrintDebugParams | null>(() => loadSavedPrintDebugParams());
  const [debugParams, setDebugParams] = useState<PrintDebugParams>(
    () => loadSavedPrintDebugParams() ?? PRINT_DEBUG_DEFAULTS,
  );
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const appliedDebugParams = savedDebugParams ?? PRINT_DEBUG_DEFAULTS;
  const isDirty = !arePrintDebugParamsEqual(debugParams, appliedDebugParams);

  const openConfigTool = useCallback(() => {
    setDebugParams(appliedDebugParams);
    setDebugOpen(true);
  }, [appliedDebugParams]);

  const handleConfigEntryTap = useCallback(() => {
    const now = Date.now();
    const isWithinWindow =
      now - configEntryTapRef.current.lastTapAt <= CONFIG_ENTRY_WINDOW_MS;
    const nextCount = isWithinWindow ? configEntryTapRef.current.count + 1 : 1;

    configEntryTapRef.current = {
      count: nextCount,
      lastTapAt: now,
    };

    if (nextCount < CONFIG_ENTRY_TAP_COUNT) {
      return;
    }

    configEntryTapRef.current = {
      count: 0,
      lastTapAt: 0,
    };
    openConfigTool();
  }, [openConfigTool]);

  useEffect(() => {
    if (!debugOpen) {
      setPreviewImage(null);
      setPreviewSrc(null);
      setPreviewLoading(false);
      return;
    }

    let isActive = true;

    setPreviewImage(null);
    setPreviewSrc(null);
    setPreviewLoading(true);

    void captureImage(webcamRef)
      .then((image) => {
        if (!isActive) {
          return;
        }

        if (!image) {
          setPreviewLoading(false);
          return;
        }

        setPreviewImage(image);
      })
      .catch((e) => {
        if (!isActive) {
          return;
        }

        logKioskEvent("error", "web.root", "preview-capture-failed", {
          error: toErrorMessage(e, "Preview capture failed."),
        });
        setPreviewLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [debugOpen]);

  useEffect(() => {
    if (!debugOpen || !previewImage) {
      return;
    }

    let isActive = true;

    setPreviewLoading(true);

    const timer = window.setTimeout(() => {
      void trpc.previewPrint
        .mutate({ image: previewImage, ...debugParams })
        .then((result) => {
          if (!isActive) {
            return;
          }

          setPreviewSrc(result.preview);
        })
        .catch((e) => {
          if (!isActive) {
            return;
          }

          if (isTRPCClientError(e)) {
            toast.error(e.message);
          }

          logKioskEvent("error", "web.root", "preview-failed", {
            error: toErrorMessage(e, "Preview failed."),
          });
        })
        .finally(() => {
          if (!isActive) {
            return;
          }

          setPreviewLoading(false);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [debugOpen, previewImage, debugParams]);

  const takeSquarePhotoAndGetDataUrl = async () => {
    try {
      if (!webcamRef.current) {
        throw new Error("Camera is not available.");
      }

      const photo = await webcamRef.current.takePhoto();
      const { width, height } = await getBlobDimensions(photo);

      logKioskEvent("info", "web.root", "photo-captured", {
        height,
        width,
      });

      if (width === height) {
        return await blobToDataUrl(photo);
      }

      logKioskEvent("info", "web.root", "square-resize-requested");

      const resizedPhoto = await trpc.squareResize.mutate(photo).catch((e) => {
        if (isTRPCClientError(e)) {
          toast.error(e.message);
        }
        logKioskEvent("error", "web.root", "square-resize-failed", {
          error: toErrorMessage(e, "Square resize failed."),
        });
      });

      if (!resizedPhoto) {
        return;
      }

      return `data:${resizedPhoto.mimeType};base64,${resizedPhoto.data}`;
    } catch (e) {
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

  const handlePrint = useCallback(
    async (params: PrintDebugParams = appliedDebugParams) => {
      try {
        const image = await captureImage(webcamRef);
        if (!image) {
          return;
        }

        await trpc.print.mutate({ image, ...params }).catch((e) => {
          if (isTRPCClientError(e)) {
            toast.error(e.message);
          }
          logKioskEvent("error", "web.root", "print-failed", {
            error: toErrorMessage(e, "Print failed."),
          });
        });
      } catch (e) {
        logKioskEvent("error", "web.root", "print-failed", {
          error: toErrorMessage(e, "Print failed."),
        });
      }
    },
    [appliedDebugParams],
  );

  const handleSaveConfig = useCallback(() => {
    savePrintDebugParams(debugParams);
    setSavedDebugParams(debugParams);
    toast.success("Print configuration saved.");
  }, [debugParams]);

  const handleResetToApplied = useCallback(() => {
    setDebugParams(appliedDebugParams);
  }, [appliedDebugParams]);

  const handleResetToDefaults = useCallback(() => {
    setDebugParams(PRINT_DEBUG_DEFAULTS);
  }, []);

  const downloadReceipt = async () => {
    const photoDataUrl = await takeSquarePhotoAndGetDataUrl();

    if (!photoDataUrl) {
      return;
    }

    const screenshot = await trpc.generateReceipt
      .mutate({
        image: photoDataUrl,
      })
      .catch((e) => {
        if (isTRPCClientError(e)) {
          toast.error(e.message);
        }
        logKioskEvent("error", "web.root", "generate-receipt-failed", {
          error: toErrorMessage(e, "Generate receipt failed."),
        });
      });

    if (!screenshot) {
      return;
    }

    const blob = base64ToBlob(screenshot.data, screenshot.mimeType);

    downloadBlob(blob, "screenshot.webp");
  };

  return (
    <div className="relative min-h-dvh bg-black">
      <div className="flex min-h-dvh items-center justify-center p-4">
        <Webcam ref={webcamRef} />
      </div>
      <div className="fixed top-8 left-8 flex flex-col gap-2">
        <Button onClick={downloadReceipt}>Download Receipt</Button>
        <Button
          onClick={() => {
            void handlePrint(debugOpen ? debugParams : appliedDebugParams);
          }}
        >
          Print
        </Button>
        {ENABLE_DEBUG_PANEL && !debugOpen && (
          <Button variant="outline" onClick={openConfigTool}>
            Debug
          </Button>
        )}
      </div>
      <button
        type="button"
        aria-label="Open print configuration"
        className="fixed right-0 bottom-0 z-40 h-16 w-16 bg-transparent"
        onClick={handleConfigEntryTap}
      />
      {debugOpen && (
        <div className="fixed top-8 right-8 z-50">
          <PrintDebugPanel
            onClose={() => setDebugOpen(false)}
            params={debugParams}
            onParamsChange={setDebugParams}
            previewSrc={previewSrc}
            previewLoading={previewLoading}
            hasSavedConfig={savedDebugParams !== null}
            isDirty={isDirty}
            onResetToApplied={handleResetToApplied}
            onResetToDefaults={handleResetToDefaults}
            onSaveConfig={handleSaveConfig}
            onPrintWithParams={() => {
              void handlePrint(debugParams);
            }}
          />
        </div>
      )}
    </div>
  );
};
