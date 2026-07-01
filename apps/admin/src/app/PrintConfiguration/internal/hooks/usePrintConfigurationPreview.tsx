import type { WebcamHandle } from "@dither-booth/ui/components/misc/Webcam";
import type { RefObject } from "react";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  PrintConfigurationEncodedImage,
  PrintConfigurationFormValues,
  PrintConfigurationInitialPreviewByTab,
  PrintConfigurationPreviewRefreshOptions,
  PrintConfigurationPreviewRefreshRequest,
  PrintConfigurationPreviewSourceByTab,
  PrintConfigurationPreviewSrcByTab,
  PrintConfigurationSaveOptions,
  PrintConfigurationTab,
} from "../PrintConfiguration.types";

import {
  clonePrintConfigurationFormValues,
  getChangedPreviewTabs,
  getInitialPreviewTriggerState,
  getPrintConfigurationImageDataUrl,
  isPrintConfigurationTab,
  reportPrintConfigurationError,
} from "../PrintConfiguration.utils";

type GeneratePrintConfigurationImage = (
  photo: Blob,
) => Promise<PrintConfigurationEncodedImage>;

interface UsePrintConfigurationPreviewParams {
  ditherPhoto: GeneratePrintConfigurationImage;
  generateReceiptImage: GeneratePrintConfigurationImage;
  isDithering: boolean;
  isGeneratingReceipt: boolean;
  isLoadingPrintConfiguration: boolean;
  persistedPrintConfiguration: PrintConfigurationFormValues;
  takeSquarePhoto: () => Promise<Blob>;
  webcamRef: RefObject<WebcamHandle | null>;
}

export const usePrintConfigurationPreview = ({
  ditherPhoto,
  generateReceiptImage,
  isDithering,
  isGeneratingReceipt,
  isLoadingPrintConfiguration,
  persistedPrintConfiguration,
  takeSquarePhoto,
  webcamRef,
}: UsePrintConfigurationPreviewParams) => {
  const latestPreviewRequestIdByTabRef = useRef<
    Record<PrintConfigurationTab, number>
  >({
    dithering: 0,
    receipt: 0,
  });
  const activeTabRef = useRef<PrintConfigurationTab>("dithering");
  const dirtyPreviewTabsRef = useRef(new Set<PrintConfigurationTab>());
  const hasTriggeredInitialPreviewRef = useRef(getInitialPreviewTriggerState());
  const latestPersistedPrintConfigurationRef = useRef<
    PrintConfigurationFormValues | undefined
  >(undefined);
  const queuedPreviewRefreshRef =
    useRef<PrintConfigurationPreviewRefreshRequest | null>(null);
  const previewRefreshChainRef = useRef<Promise<void>>(Promise.resolve());
  const previewSourcePhotoByTabRef =
    useRef<PrintConfigurationPreviewSourceByTab>({});
  const previewSrcByTabRef = useRef<PrintConfigurationPreviewSrcByTab>({});

  const [activeTab, setActiveTab] =
    useState<PrintConfigurationTab>("dithering");
  const [previewSrcByTab, setPreviewSrcByTab] =
    useState<PrintConfigurationPreviewSrcByTab>({});
  const [hasTriggeredInitialPreview, setHasTriggeredInitialPreview] =
    useState<PrintConfigurationInitialPreviewByTab>(
      getInitialPreviewTriggerState,
    );

  const capturePreviewSourcePhoto = useCallback(
    async (tab: PrintConfigurationTab) => {
      return await takeSquarePhoto().catch((e) => {
        reportPrintConfigurationError(
          e,
          tab === "dithering"
            ? "preview-photo-capture-failed"
            : "preview-receipt-photo-capture-failed",
          tab === "dithering"
            ? "Take square photo failed."
            : "Take square photo for receipt preview failed.",
        );
        return undefined;
      });
    },
    [takeSquarePhoto],
  );

  const generateDitheringPreviewDataUrl = useCallback(
    async (photo: Blob) => {
      const ditheredSquarePhoto = await ditherPhoto(photo).catch((e) => {
        reportPrintConfigurationError(
          e,
          "preview-dither-failed",
          "Generate preview failed.",
        );
      });

      if (!ditheredSquarePhoto) {
        return;
      }

      return getPrintConfigurationImageDataUrl(ditheredSquarePhoto);
    },
    [ditherPhoto],
  );

  const generateReceiptPreviewDataUrl = useCallback(
    async (photo: Blob) => {
      const receipt = await generateReceiptImage(photo).catch((e) => {
        reportPrintConfigurationError(
          e,
          "preview-receipt-failed",
          "Generate receipt preview failed.",
        );
      });

      if (!receipt) {
        return;
      }

      return getPrintConfigurationImageDataUrl(receipt);
    },
    [generateReceiptImage],
  );

  const getPreviewDataUrl = useCallback(
    async (tab: PrintConfigurationTab, photo: Blob) => {
      return tab === "dithering"
        ? await generateDitheringPreviewDataUrl(photo)
        : await generateReceiptPreviewDataUrl(photo);
    },
    [generateDitheringPreviewDataUrl, generateReceiptPreviewDataUrl],
  );

  const setInitialPreviewTrigger = useCallback(
    (tab: PrintConfigurationTab, hasTriggered: boolean) => {
      setHasTriggeredInitialPreview((previousHasTriggeredInitialPreview) => {
        const nextHasTriggeredInitialPreview = {
          ...previousHasTriggeredInitialPreview,
          [tab]: hasTriggered,
        };

        hasTriggeredInitialPreviewRef.current = nextHasTriggeredInitialPreview;

        return nextHasTriggeredInitialPreview;
      });
    },
    [],
  );

  const resetInitialPreviewTrigger = useCallback(
    (tab: PrintConfigurationTab) => {
      setInitialPreviewTrigger(tab, false);
    },
    [setInitialPreviewTrigger],
  );

  const runPreviewRefresh = useCallback(
    async (request: PrintConfigurationPreviewRefreshRequest) => {
      const previewTab = request.tab;
      const activePreviewSrc = previewSrcByTabRef.current[previewTab];

      setInitialPreviewTrigger(previewTab, true);

      let previewSourcePhoto = previewSourcePhotoByTabRef.current[previewTab];

      if (request.sourceMode === "capture") {
        if (webcamRef.current?.cameraState.status !== "ready") {
          if (!activePreviewSrc) {
            resetInitialPreviewTrigger(previewTab);
          }

          return;
        }

        previewSourcePhoto = await capturePreviewSourcePhoto(previewTab);

        if (!previewSourcePhoto) {
          if (!activePreviewSrc) {
            resetInitialPreviewTrigger(previewTab);
          }

          return;
        }

        previewSourcePhotoByTabRef.current = {
          ...previewSourcePhotoByTabRef.current,
          [previewTab]: previewSourcePhoto,
        };
      }

      if (!previewSourcePhoto) {
        if (!activePreviewSrc) {
          resetInitialPreviewTrigger(previewTab);
        }

        return;
      }

      const previewDataUrl = await getPreviewDataUrl(
        previewTab,
        previewSourcePhoto,
      );

      if (
        request.requestId !==
        latestPreviewRequestIdByTabRef.current[previewTab]
      ) {
        return;
      }

      if (!previewDataUrl) {
        if (!activePreviewSrc) {
          resetInitialPreviewTrigger(previewTab);
        }

        return;
      }

      dirtyPreviewTabsRef.current.delete(previewTab);
      setPreviewSrcByTab((previousPreviewSrcByTab) => {
        const nextPreviewSrcByTab = {
          ...previousPreviewSrcByTab,
          [previewTab]: previewDataUrl,
        };

        previewSrcByTabRef.current = nextPreviewSrcByTab;

        return nextPreviewSrcByTab;
      });
    },
    [
      capturePreviewSourcePhoto,
      getPreviewDataUrl,
      resetInitialPreviewTrigger,
      setInitialPreviewTrigger,
      webcamRef,
    ],
  );

  const flushQueuedPreviewRefreshes = useCallback(async () => {
    while (queuedPreviewRefreshRef.current) {
      const queuedPreviewRefresh = queuedPreviewRefreshRef.current;
      queuedPreviewRefreshRef.current = null;
      await runPreviewRefresh(queuedPreviewRefresh);
    }
  }, [runPreviewRefresh]);

  const schedulePreviewRefreshForTab = useCallback(
    (
      tab: PrintConfigurationTab,
      options: PrintConfigurationPreviewRefreshOptions,
    ) => {
      const requestId = latestPreviewRequestIdByTabRef.current[tab] + 1;
      latestPreviewRequestIdByTabRef.current = {
        ...latestPreviewRequestIdByTabRef.current,
        [tab]: requestId,
      };
      queuedPreviewRefreshRef.current = {
        requestId,
        sourceMode: options.sourceMode,
        tab,
      };

      const previewRefreshPromise = previewRefreshChainRef.current
        .catch(() => undefined)
        .then(flushQueuedPreviewRefreshes);

      previewRefreshChainRef.current = previewRefreshPromise;

      return previewRefreshPromise;
    },
    [flushQueuedPreviewRefreshes],
  );

  const refreshActivePreview = useCallback(async () => {
    await schedulePreviewRefreshForTab(activeTabRef.current, {
      sourceMode: "capture",
    });
  }, [schedulePreviewRefreshForTab]);

  const refreshPreviewAfterSave = useCallback(
    (
      submittedValues: PrintConfigurationFormValues,
      options: PrintConfigurationSaveOptions = {},
    ) => {
      const previousPersistedValues =
        latestPersistedPrintConfigurationRef.current;
      const nextPersistedValues =
        clonePrintConfigurationFormValues(submittedValues);
      const affectedTabs = new Set(
        getChangedPreviewTabs(previousPersistedValues, nextPersistedValues),
      );

      latestPersistedPrintConfigurationRef.current = nextPersistedValues;

      if (options.forceActivePreviewRefresh) {
        affectedTabs.add(activeTabRef.current);
      }

      for (const tab of affectedTabs) {
        dirtyPreviewTabsRef.current.add(tab);
      }

      const activePreviewTab = activeTabRef.current;

      if (!affectedTabs.has(activePreviewTab)) {
        return;
      }

      const activePreviewSrc = previewSrcByTabRef.current[activePreviewTab];
      const shouldCaptureSource =
        options.forceActivePreviewRefresh === true || !activePreviewSrc;

      if (
        !shouldCaptureSource &&
        !previewSourcePhotoByTabRef.current[activePreviewTab]
      ) {
        return;
      }

      void schedulePreviewRefreshForTab(activePreviewTab, {
        sourceMode: shouldCaptureSource ? "capture" : "reuse",
      });
    },
    [schedulePreviewRefreshForTab],
  );

  const handleActiveTabChange = useCallback(
    (value: string) => {
      if (!isPrintConfigurationTab(value)) {
        return;
      }

      activeTabRef.current = value;
      setActiveTab(value);

      if (
        !dirtyPreviewTabsRef.current.has(value) ||
        !hasTriggeredInitialPreviewRef.current[value] ||
        !previewSourcePhotoByTabRef.current[value]
      ) {
        return;
      }

      void schedulePreviewRefreshForTab(value, { sourceMode: "reuse" });
    },
    [schedulePreviewRefreshForTab],
  );

  useEffect(() => {
    if (isLoadingPrintConfiguration) {
      return;
    }

    latestPersistedPrintConfigurationRef.current =
      clonePrintConfigurationFormValues(persistedPrintConfiguration);
  }, [isLoadingPrintConfiguration, persistedPrintConfiguration]);

  const activePreviewSrc = previewSrcByTab[activeTab];
  const hasTriggeredActiveInitialPreview =
    hasTriggeredInitialPreview[activeTab];
  const isRefreshingActivePreview =
    activeTab === "dithering" ? isDithering : isGeneratingReceipt;

  return {
    activePreviewSrc,
    activeTab,
    handleActiveTabChange,
    hasTriggeredActiveInitialPreview,
    isRefreshingActivePreview,
    refreshActivePreview,
    refreshPreviewAfterSave,
  };
};
