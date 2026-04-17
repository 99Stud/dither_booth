import { type CameraState, Webcam, type WebcamHandle } from "#components/misc/Webcam/index.tsx";
import { buttonVariants } from "#components/ui/button.tsx";
import { Spinner } from "#components/ui/spinner.tsx";
import { takeSquarePhoto } from "#lib/image-manipulation/image-manipulation.utils.ts";
import { reportKioskError } from "#lib/logging/logging.utils.ts";
import { normalizeTicketNames, ticketNamesParser } from "#lib/ticket-names.ts";
import {
  base64ToBlob,
  type PrintTicketSequenceProgress,
  subscribePrintTicketSequence,
  useTRPC,
  useTRPCClient,
} from "#lib/trpc/trpc.utils.ts";
import { blobToDataUrl, cn } from "#lib/utils.ts";
import { logKioskEvent } from "@dither-booth/logging";
import { validateTicketNames } from "@dither-booth/moderation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { type FC, useCallback, useEffect, useRef, useState } from "react";

import { BOOTH_LOG_SOURCE } from "./internal/Booth.constants";

type BoothPhase = "idle" | "countdown" | "flash" | "processing" | "thank-you";

const COUNTDOWN_SECONDS = 4;
const THANK_YOU_DURATION_MS = 6_000;
const FLASH_HOLD_MS = 140;

const PRINT_TICKET_PROGRESS_LABELS: Record<PrintTicketSequenceProgress["step"], string> = {
  load_config: "__CONFIG_LOADING__",
  decode: "Decoding image…",
  prepare_receipt: "Preparing receipt…",
  prepare_lottery: "Preparing lottery ticket…",
  printing_receipt: "First output: your ticket…",
  printing_lottery: "Last output: your lottery ticket…",
};

const roundMs = (since: number) => Math.round((performance.now() - since) * 100) / 100;

export const Booth: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);
  const navigate = useNavigate();

  const [cameraReady, setCameraReady] = useState(false);
  const [phase, setPhase] = useState<BoothPhase>("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState("Preparing your ticket…");

  const [ticketRaw] = useQueryState("ticket", ticketNamesParser);
  const ticketNames = normalizeTicketNames(ticketRaw ?? []);
  const ticketNamesValidation = validateTicketNames(ticketNames);
  const canUseTicketNames = ticketNamesValidation.ok;

  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const { data: printConfig } = useQuery(trpc.getDitherConfiguration.queryOptions());
  const { data: lotteryConfig } = useQuery(trpc.getLotteryConfig.queryOptions());
  const generateReceipt = useMutation(trpc.generateReceipt.mutationOptions());
  const primeReceiptMutation = useMutation(trpc.primeReceipt.mutationOptions());
  const printReceipt = useMutation(trpc.print.mutationOptions());
  const lotteryDrawMutation = useMutation(trpc.lotteryDraw.mutationOptions());
  const generateLotteryTicketMutation = useMutation(trpc.generateLotteryTicket.mutationOptions());

  const showTicketNameHeader =
    printConfig?.namesEntryEnabled === true && ticketNames.length > 0 && phase === "idle";

  const isBusy = phase !== "idle";
  const canStart = cameraReady && canUseTicketNames && !isBusy;

  const goToSplash = useCallback(() => {
    void navigate({ to: "/" });
  }, [navigate]);

  const handleCameraStateChange = useCallback((s: CameraState) => {
    setCameraReady(s.status === "ready");
  }, []);

  const startSequence = useCallback(async () => {
    setError(null);
    setCountdown(COUNTDOWN_SECONDS);
    setPhase("countdown");

    for (let i = COUNTDOWN_SECONDS; i >= 1; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 1_000));
    }

    setPhase("flash");
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    try {
      const clientFlowId = crypto.randomUUID();
      logKioskEvent("info", BOOTH_LOG_SOURCE, "booth-print-flow-start", {
        details: { clientFlowId },
      });

      const captureStart = Date.now();
      const photoStartedAt = performance.now();

      const photoPromise = takeSquarePhoto(BOOTH_LOG_SOURCE, async () => {
        if (!webcamRef.current) {
          throw new Error("Camera is not available.");
        }
        return await webcamRef.current.takePhoto();
      });

      // Keep the white flash visible for a short, fixed duration regardless of
      // how long the actual photo capture takes, then swap to the processing
      // overlay while the photo resolves in the background.
      await new Promise<void>((resolve) => setTimeout(resolve, FLASH_HOLD_MS));
      setProcessingStatus("Preparing your ticket…");
      setPhase("processing");

      const squarePhoto = await photoPromise;
      const photoCaptureMs = roundMs(photoStartedAt);

      const dataUrlStartedAt = performance.now();
      const photoDataUrl = await blobToDataUrl(squarePhoto);
      const dataUrlMs = roundMs(dataUrlStartedAt);

      const receiptStartedAt = performance.now();
      const screenshot = await generateReceipt.mutateAsync({
        image: photoDataUrl,
        names: ticketNames.length > 0 ? ticketNames : undefined,
        clientFlowId,
      });
      const generateReceiptMs = roundMs(receiptStartedAt);

      const isLotteryLive =
        lotteryConfig?.enabled === true &&
        lotteryConfig?.sessionActive === true &&
        lotteryConfig?.currentSessionId != null;

      if (isLotteryLive) {
        const captureToDrawMs = Date.now() - captureStart;

        const drawStartedAt = performance.now();
        const drawResult = await lotteryDrawMutation.mutateAsync({
          captureToDrawMs,
          clientFlowId,
        });
        const lotteryDrawMs = roundMs(drawStartedAt);

        const ticketStartedAt = performance.now();
        const lotteryTicket = await generateLotteryTicketMutation.mutateAsync({
          outcome: drawResult.outcome === "win" ? "win" : "loss",
          lotLabel: drawResult.lotLabel,
          lotRarity: drawResult.lotRarity,
          clientFlowId,
        });
        const generateLotteryTicketMs = roundMs(ticketStartedAt);

        const printSeqStartedAt = performance.now();
        await subscribePrintTicketSequence(
          trpcClient,
          {
            receiptImage: screenshot.data,
            lotteryTicketImage: lotteryTicket.data,
            clientFlowId,
          },
          (value) => {
            setProcessingStatus(PRINT_TICKET_PROGRESS_LABELS[value.step]);
          },
        );
        const printTicketSequenceMs = roundMs(printSeqStartedAt);

        logKioskEvent("info", BOOTH_LOG_SOURCE, "booth-print-flow-metrics", {
          details: {
            clientFlowId,
            path: "lottery",
            photoCaptureMs,
            dataUrlMs,
            generateReceiptMs,
            lotteryDrawMs,
            generateLotteryTicketMs,
            printTicketSequenceMs,
            totalClientMs: roundMs(photoStartedAt),
          },
        });
      } else {
        const printStartedAt = performance.now();
        setProcessingStatus("Your ticket is being printed…");
        const blob = base64ToBlob(screenshot.data, screenshot.mimeType);
        await printReceipt.mutateAsync(blob);
        const printMs = roundMs(printStartedAt);

        logKioskEvent("info", BOOTH_LOG_SOURCE, "booth-print-flow-metrics", {
          details: {
            clientFlowId,
            path: "simple",
            photoCaptureMs,
            dataUrlMs,
            generateReceiptMs,
            printMs,
            totalClientMs: roundMs(photoStartedAt),
          },
        });
      }

      setPhase("thank-you");

      setTimeout(() => {
        goToSplash();
      }, THANK_YOU_DURATION_MS);
    } catch (e) {
      const msg = reportKioskError(e, {
        event: "booth-print-flow-failed",
        source: BOOTH_LOG_SOURCE,
        userMessage: "Une erreur est survenue. Veuillez réessayer.",
      });
      setError(msg);
      setPhase("idle");
    }
  }, [
    ticketNames,
    lotteryConfig,
    generateReceipt,
    printReceipt,
    lotteryDrawMutation,
    generateLotteryTicketMutation,
    trpcClient,
    goToSplash,
  ]);

  const namesKey = ticketNames.join("\0");
  useEffect(() => {
    if (!canUseTicketNames) return;
    primeReceiptMutation.mutate({
      names: ticketNames.length > 0 ? ticketNames : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseTicketNames, namesKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " && canStart) {
        e.preventDefault();
        startSequence();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canStart, startSequence]);

  return (
    <div className="relative flex min-h-dvh touch-none flex-col overflow-x-hidden overscroll-none text-foreground">
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.25rem,env(safe-area-inset-top))] pb-[max(2.75rem,calc(env(safe-area-inset-bottom)+2rem))]">
        <div className="relative mb-8 w-[min(98vw,calc(100dvh-8rem))] shrink-0">
          <div
            className={cn(
              "relative aspect-square w-full overflow-hidden border border-primary/45 bg-background/30 shadow-[0_0_0_1px_oklch(0.85_0.06_48/0.12),0_12px_48px_-12px_oklch(0_0_0/0.55)]",
              "transition-[border-color,box-shadow] duration-500 ease-out motion-reduce:transition-none",
              !cameraReady && "border-primary/25 shadow-[0_12px_32px_-16px_oklch(0_0_0/0.35)]",
            )}
          >
            {showTicketNameHeader && (
              <div className="absolute top-0 right-0 left-0 z-20 animate-in fade-in slide-in-from-top-2 border-b border-primary/25 bg-background/70 px-2 py-2 shadow-[0_0_30px_oklch(0.7_0.2_48/0.08)] backdrop-blur-sm duration-300 ease-out motion-reduce:animate-none sm:px-3 sm:py-2.5">
                {canUseTicketNames ? (
                  <ul className="flex flex-wrap justify-center gap-x-2 gap-y-1.5 opacity-90 sm:gap-x-2.5">
                    {ticketNames.map((name, i) => (
                      <li
                        key={`${i}-${name}`}
                        className="flex items-baseline gap-1.5 border border-primary/35 bg-background/55 px-2 py-1 font-mono text-[10px] text-muted-foreground hud-text-glow-orange-soft sm:text-[11px]"
                      >
                        <span className="min-w-[1.1em] tabular-nums text-primary/55">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="max-w-[9rem] truncate sm:max-w-[11rem]">{name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-center font-mono text-[10px] leading-snug text-destructive sm:text-[11px]">
                    Un nom est bloqué. Retournez en arrière pour le corriger.
                  </p>
                )}
              </div>
            )}

            <div
              className={cn(
                "absolute inset-0 z-0 overflow-hidden",
                "origin-center transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:duration-0",
                cameraReady ? "scale-100 opacity-100" : "scale-[1.03] opacity-0",
                phase === "countdown" && cameraReady && "brightness-[0.72]",
              )}
            >
              <Webcam
                ref={webcamRef}
                className="absolute inset-0 h-full w-full object-cover"
                onCameraStateChange={handleCameraStateChange}
              />
            </div>

            <div
              aria-hidden={cameraReady}
              className={cn(
                "absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/60 backdrop-blur-[2px]",
                "transition-opacity duration-500 ease-out motion-reduce:transition-none",
                cameraReady ? "pointer-events-none opacity-0" : "opacity-100",
              )}
            >
              <Spinner className="size-8 text-primary motion-reduce:opacity-90" />
              <p className="font-mono text-xs tracking-[0.25em] text-primary/70 uppercase">
                Initialisation caméra…
              </p>
            </div>

            {phase === "idle" && error && (
              <p
                className="absolute inset-x-3 bottom-[30%] z-[45] text-center font-mono text-[11px] leading-snug text-destructive [text-shadow:0_0_12px_oklch(0_0_0/0.9)] sm:inset-x-6 sm:bottom-[28%] sm:text-xs"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          {phase === "idle" && (
            <div className="pointer-events-none absolute right-3 bottom-0 left-3 z-30 flex justify-center sm:right-6 sm:left-6">
              <button
                type="button"
                disabled={!canStart}
                className={cn(
                  buttonVariants({ variant: "hud", size: "touch" }),
                  "hud-cta-pulse pointer-events-auto min-h-24 w-full max-w-sm translate-y-1/2 justify-center py-4 font-bit font-bold text-2xl text-white shadow-[0_8px_32px_-4px_oklch(0_0_0/0.55)]",
                  !canStart && "pointer-events-none opacity-40",
                )}
                onClick={startSequence}
              >
                Prendre la photo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Countdown overlay */}
      {phase === "countdown" && (
        <div className="fixed inset-0 z-30 flex items-center justify-center">
          <span
            key={countdown}
            className="animate-in zoom-in-75 fade-in font-bit text-[min(30vw,180px)] font-bold leading-none text-white drop-shadow-[0_0_48px_oklch(0.99_0.02_95/0.55)]"
            style={{ animationDuration: "300ms" }}
          >
            {countdown}
          </span>
        </div>
      )}

      {/* Flash overlay */}
      {phase === "flash" && (
        <div
          className="fixed inset-0 z-40 animate-out fade-out bg-white pointer-events-none"
          style={{ animationDuration: `${FLASH_HOLD_MS}ms`, animationFillMode: "forwards" }}
        />
      )}

      {/* Processing overlay — Splash-style terminal + PP Neue Bit */}
      {phase === "processing" && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-background/70 px-4 backdrop-blur-sm">
          <Spinner className="size-10 text-primary" />
          <div
            className="w-full max-w-[min(92vw,28rem)] border border-primary/40 px-3 py-3 shadow-[0_0_30px_oklch(0.7_0.2_48/0.08)] backdrop-blur-sm"
            role="status"
            aria-live="polite"
          >
            <div className="mb-2 flex items-center justify-between gap-3 border-b border-primary/25 pb-2 font-bit text-[9px] uppercase sm:text-[10px]">
              <span className="hud-text-glow-orange tracking-[0.22em]">print_stream</span>
              <span className="hud-text-glow-orange-soft tracking-[0.2em]">
                Busy
                <span aria-hidden className="hud-cursor-blink ml-1 inline-block">
                  *
                </span>
              </span>
            </div>
            <p className="wrap-break-word text-center font-bit text-sm leading-relaxed tracking-[0.06em] text-muted-foreground hud-text-glow-orange-soft sm:text-base">
              {processingStatus}
            </p>
          </div>
        </div>
      )}

      {/* Thank you overlay */}
      {phase === "thank-you" && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-background/90 px-4 backdrop-blur-sm">
          <p className="hud-text-glow-orange font-bit text-2xl tracking-[0.14em] text-primary uppercase sm:text-3xl">
            Merci !
          </p>
          <p className="max-w-[min(92vw,24rem)] text-center font-bit text-sm leading-relaxed tracking-[0.08em] text-primary/70 uppercase sm:text-base">
            Récupérez votre ticket
          </p>
        </div>
      )}
    </div>
  );
};
