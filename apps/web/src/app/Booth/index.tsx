import {
  type CameraState,
  Webcam,
  type WebcamHandle,
} from "#components/misc/Webcam/index.tsx";
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
    <div className="relative h-dvh overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 hud-grid-bg opacity-50"
      />

      {/* Camera feed */}
      <div className="relative z-0 flex h-full items-center justify-center">
        <Webcam
          ref={webcamRef}
          className={cn(
            "h-full w-full object-cover",
            !cameraReady && "invisible",
          )}
          onCameraStateChange={handleCameraStateChange}
        />

        {!cameraReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
            <Spinner className="size-8 text-primary" />
            <p className="font-mono text-xs tracking-[0.25em] text-primary/70 uppercase">
              Initialisation caméra…
            </p>
          </div>
        )}
      </div>

      {/* HUD: names (idle) */}
      {phase === "idle" && ticketNames.length > 0 && (
        <div className="fixed top-8 right-8 z-20 max-w-[min(90vw,20rem)] border border-primary/40 bg-background/85 px-4 py-3 text-end font-mono text-[11px] shadow-[0_0_30px_oklch(0_0_0/0.55)] backdrop-blur-sm">
          {canUseTicketNames ? (
            <ul className="space-y-0.5 text-muted-foreground">
              {ticketNames.map((name, i) => (
                <li key={`${i}-${name}`}>— {name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-start text-destructive">
              Un nom est bloqué. Retournez en arrière pour le corriger.
            </p>
          )}
        </div>
      )}

      {/* CTA (idle) */}
      {phase === "idle" && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col items-center gap-6 p-6 pb-10">
          {error && (
            <p className="font-mono text-xs text-destructive">{error}</p>
          )}

          <button
            type="button"
            disabled={!canStart}
            className={cn(
              "hud-cta-pulse min-h-16 w-full max-w-md border-2 border-primary bg-background px-8 py-4 font-mono text-base tracking-[0.18em] text-primary uppercase shadow-[0_0_20px_oklch(0.7_0.2_48/0.25)] transition-opacity sm:text-lg",
              "hud-text-glow-orange",
              !canStart && "pointer-events-none opacity-40",
            )}
            onClick={startSequence}
          >
            Prendre la photo
          </button>
        </div>
      )}

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
