import { PrintConfigurationPanel } from "#components/misc/PrintConfigurationPanel/index.tsx";
import { Webcam, type WebcamHandle } from "#components/misc/Webcam/index.tsx";
import { Button } from "#components/ui/button.tsx";
import { takeSquarePhoto } from "#lib/image-manipulation/image-manipulation.utils.ts";
import { reportKioskError } from "#lib/logging/logging.utils.ts";
import { ENABLE_PRINT_DEBUG_PANEL } from "#lib/public-env.ts";
import { normalizeTicketNames, ticketNamesParser } from "#lib/ticket-names.ts";
import { base64ToBlob, useTRPC } from "#lib/trpc/trpc.utils.ts";
import { blobToDataUrl, downloadBlob } from "#lib/utils.ts";
import { useMutation } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { type FC, useRef, useState } from "react";

import { BOOTH_LOG_SOURCE } from "./internal/Booth.constants";

export const Booth: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);

  const [ticketRaw] = useQueryState("ticket", ticketNamesParser);
  const ticketNames = normalizeTicketNames(ticketRaw ?? []);

  const trpc = useTRPC();

  const [printConfigurationPanelOpen, setPrintConfigurationPanelOpen] =
    useState(false);

  const generateReceipt = useMutation(trpc.generateReceipt.mutationOptions());
  const { isPending: isGeneratingReceipt } = generateReceipt;

  const takeSquarePhotoAndGetDataUrl = async () => {
    try {
      const squarePhoto = await takeSquarePhoto(BOOTH_LOG_SOURCE, async () => {
        if (!webcamRef.current) {
          throw new Error("Camera is not available.");
        }

        return await webcamRef.current.takePhoto();
      });

      return await blobToDataUrl(squarePhoto);
    } catch (e) {
      reportKioskError(e, {
        event: "take-square-photo-and-get-data-url-failed",
        source: BOOTH_LOG_SOURCE,
        userMessage: "Take square photo and get data URL failed.",
      });
    }
  };

  const downloadReceipt = async () => {
    try {
      const photoDataUrl = await takeSquarePhotoAndGetDataUrl();

      if (!photoDataUrl) {
        return;
      }

      const screenshot = await generateReceipt.mutateAsync({
        image: photoDataUrl,
        names: ticketNames.length > 0 ? ticketNames : undefined,
      });

      const blob = base64ToBlob(screenshot.data, screenshot.mimeType);

      downloadBlob(blob, "screenshot.webp");
    } catch (e) {
      reportKioskError(e, {
        event: "generate-receipt-failed",
        source: BOOTH_LOG_SOURCE,
        userMessage: "Generate receipt failed.",
      });
    }
  };

  const closePrintConfigurationPanel = () => {
    setPrintConfigurationPanelOpen(false);
  };

  const openPrintConfigurationPanel = () => {
    setPrintConfigurationPanelOpen(true);
  };

  return (
    <div className="relative h-dvh bg-background">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 hud-grid-bg opacity-50"
      />
      <div className="relative z-10 flex h-full items-center justify-center p-4">
        <Webcam ref={webcamRef} className="h-full" />
      </div>
      <div className="fixed top-8 left-8 z-20 flex flex-col gap-3 font-mono">
        <div className="border border-primary/45 bg-background/90 shadow-[0_0_32px_oklch(0_0_0/0.55)] backdrop-blur-sm">
          <div className="hud-text-glow-orange border-b border-primary/35 px-3 py-1.5 text-[10px] tracking-[0.25em] text-primary uppercase">
            Output
          </div>
          <div className="flex flex-col gap-2 p-3">
            {ticketNames.length > 0 && (
              <div className="border-b border-primary/25 pb-2 font-mono text-[10px] leading-snug text-primary">
                <div className="hud-text-glow-orange-soft mb-1 tracking-[0.2em] uppercase">
                  Ticket
                </div>
                <ul className="space-y-0.5 text-muted-foreground">
                  {ticketNames.map((name, index) => (
                    <li key={`${index}-${name}`}>— {name}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button
              disabled={isGeneratingReceipt}
              variant="hud"
              size="touch"
              className="w-full min-w-[220px] justify-center normal-case tracking-normal"
              onClick={downloadReceipt}
            >
              {isGeneratingReceipt ? "Generating receipt…" : "Download receipt"}
            </Button>
            {ENABLE_PRINT_DEBUG_PANEL && (
              <Button variant="outline" size="default" onClick={openPrintConfigurationPanel}>
                Print configuration
              </Button>
            )}
          </div>
        </div>
      </div>
      {ENABLE_PRINT_DEBUG_PANEL && printConfigurationPanelOpen && (
        <div className="fixed top-8 right-8 z-50">
          <PrintConfigurationPanel
            webcamRef={webcamRef}
            onClose={closePrintConfigurationPanel}
          />
        </div>
      )}
    </div>
  );
};
