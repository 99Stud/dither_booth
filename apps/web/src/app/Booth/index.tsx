import {
  type CameraState,
  Webcam,
  type WebcamHandle,
} from "#components/misc/Webcam/index.tsx";
import { HudBackground } from "#components/backgrounds/HudBackground/HudBackground.tsx";
import { buttonVariants } from "#components/ui/button.tsx";
import { Spinner } from "#components/ui/spinner.tsx";
import { takeSquarePhoto } from "#lib/image-manipulation/image-manipulation.utils.ts";
import { reportKioskError } from "#lib/logging/logging.utils.ts";
import { navigateWithViewTransition } from "#lib/navigate-with-view-transition.ts";
import { normalizeTicketNames, ticketNamesParser } from "#lib/ticket-names.ts";
import { base64ToBlob, useTRPC } from "#lib/trpc/trpc.utils.ts";
import { blobToDataUrl, cn } from "#lib/utils.ts";
import { validateTicketNames } from "@dither-booth/moderation";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { type FC, useCallback, useEffect, useRef, useState } from "react";

import { BOOTH_LOG_SOURCE } from "./internal/Booth.constants";

type BoothPhase =
  | "idle"
  | "countdown"
  | "flash"
  | "processing"
  | "thank-you";

const COUNTDOWN_SECONDS = 4;
const THANK_YOU_DURATION_MS = 6_000;

export const Booth: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);
  const navigate = useNavigate();

  const [cameraReady, setCameraReady] = useState(false);
  const [phase, setPhase] = useState<BoothPhase>("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [error, setError] = useState<string | null>(null);

  const [ticketRaw] = useQueryState("ticket", ticketNamesParser);
  const ticketNames = normalizeTicketNames(ticketRaw ?? []);
  const ticketNamesValidation = validateTicketNames(ticketNames);
  const canUseTicketNames = ticketNamesValidation.ok;

  const trpc = useTRPC();
  const generateReceipt = useMutation(trpc.generateReceipt.mutationOptions());
  const printReceipt = useMutation(trpc.print.mutationOptions());

  const isBusy = phase !== "idle";
  const canStart = cameraReady && canUseTicketNames && !isBusy;

  const goToSplash = useCallback(() => {
    navigateWithViewTransition(navigate, { to: "/" });
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
    await new Promise((r) => setTimeout(r, 200));

    setPhase("processing");

    try {
      const squarePhoto = await takeSquarePhoto(BOOTH_LOG_SOURCE, async () => {
        if (!webcamRef.current) {
          throw new Error("Camera is not available.");
        }
        return await webcamRef.current.takePhoto();
      });

      const photoDataUrl = await blobToDataUrl(squarePhoto);

      const screenshot = await generateReceipt.mutateAsync({
        image: photoDataUrl,
        names: ticketNames.length > 0 ? ticketNames : undefined,
      });

      const blob = base64ToBlob(screenshot.data, screenshot.mimeType);

      await printReceipt.mutateAsync(blob);

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
  }, [ticketNames, generateReceipt, printReceipt, goToSplash]);

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
    <div className="relative flex min-h-dvh touch-none flex-col overflow-x-hidden overscroll-none bg-background text-foreground">
      <HudBackground />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(2.75rem,calc(env(safe-area-inset-bottom)+2rem))]">
        <div className="relative mb-8 w-[min(98vw,calc(100dvh-8rem))] shrink-0">
          <div
            className={cn(
              "relative aspect-square w-full overflow-hidden border border-primary/45 bg-background/30 shadow-[0_0_0_1px_oklch(0.85_0.06_48/0.12),0_12px_48px_-12px_oklch(0_0_0/0.55)]",
              !cameraReady && "border-primary/25",
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute top-2 left-2 z-10 size-7 border-l-2 border-t-2 border-primary/70 sm:top-3 sm:left-3 sm:size-9 hud-splash-bracket-animate"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute top-2 right-2 z-10 size-7 border-r-2 border-t-2 border-primary/70 sm:top-3 sm:right-3 sm:size-9 hud-splash-bracket-animate"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-2 left-2 z-10 size-7 border-b-2 border-l-2 border-primary/70 sm:bottom-3 sm:left-3 sm:size-9 hud-splash-bracket-animate"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute right-2 bottom-2 z-10 size-7 border-b-2 border-r-2 border-primary/70 sm:bottom-3 sm:right-3 sm:size-9 hud-splash-bracket-animate"
            />

            {phase === "idle" && ticketNames.length > 0 && (
              <div className="absolute top-0 right-0 left-0 z-20 border-b border-primary/25 bg-background/70 px-2 py-2 shadow-[0_0_30px_oklch(0.7_0.2_48/0.08)] backdrop-blur-sm sm:px-3 sm:py-2.5">
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

            <Webcam
              ref={webcamRef}
              className={cn(
                "absolute inset-0 z-0 h-full w-full object-cover",
                !cameraReady && "invisible",
              )}
              onCameraStateChange={handleCameraStateChange}
            />

            {!cameraReady && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/60 backdrop-blur-[2px]">
                <Spinner className="size-8 text-primary" />
                <p className="font-mono text-xs tracking-[0.25em] text-primary/70 uppercase">
                  Initialisation caméra…
                </p>
              </div>
            )}

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
                  "hud-cta-pulse pointer-events-auto w-full max-w-md translate-y-1/2 justify-center text-base shadow-[0_8px_32px_-4px_oklch(0_0_0/0.55)] sm:text-lg",
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
            className="animate-in zoom-in-75 fade-in font-mono text-[min(30vw,180px)] font-bold leading-none text-primary drop-shadow-[0_0_48px_oklch(0.75_0.2_48/0.7)]"
            style={{ animationDuration: "300ms" }}
          >
            {countdown}
          </span>
        </div>
      )}

      {/* Flash overlay */}
      {phase === "flash" && (
        <div className="fixed inset-0 z-40 animate-out fade-out bg-white pointer-events-none" style={{ animationDuration: "200ms" }} />
      )}

      {/* Processing overlay */}
      {phase === "processing" && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm">
          <Spinner className="size-10 text-primary" />
          <p className="font-mono text-sm tracking-[0.2em] text-primary/80 uppercase">
            Impression en cours…
          </p>
        </div>
      )}

      {/* Thank you overlay */}
      {phase === "thank-you" && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-background/90 backdrop-blur-sm">
          <p className="hud-text-glow-orange font-mono text-2xl tracking-[0.18em] text-primary uppercase sm:text-3xl">
            Merci !
          </p>
          <p className="font-mono text-sm tracking-[0.15em] text-primary/70 uppercase sm:text-base">
            Récupérez votre ticket
          </p>
        </div>
      )}
    </div>
  );
};
