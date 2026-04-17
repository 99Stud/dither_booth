import { getNextSyncValue } from "#app/Splash/internal/SplashHud.utils.ts";
import { SplashHudTerminal } from "#app/Splash/internal/SplashHudTerminal.tsx";
import { DitherBoothSplashLogo } from "#components/svg/DitherBoothSplashLogo/index.tsx";
import { buttonVariants } from "#components/ui/button.tsx";
import { requestKioskFullscreen } from "#lib/kiosk-fullscreen.ts";
import {
  DEFAULT_BOOTH_TICKET_DISPLAY_NAMES,
  ticketNamesToBoothSearchRecord,
} from "#lib/ticket-names.ts";
import { useTRPC } from "#lib/trpc/trpc.utils.ts";
import { cn } from "#lib/utils.ts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FC, useCallback, useEffect, useState } from "react";

export const Splash: FC = () => {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const { data: printConfig, isLoading: isLoadingPrintConfig } = useQuery(
    trpc.getDitherConfiguration.queryOptions(),
  );

  const primeReceiptMutation = useMutation(trpc.primeReceipt.mutationOptions());

  useEffect(() => {
    if (isLoadingPrintConfig) return;
    primeReceiptMutation.mutate({
      names: [...DEFAULT_BOOTH_TICKET_DISPLAY_NAMES],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingPrintConfig]);

  const goToExperience = useCallback(async () => {
    await requestKioskFullscreen();
    requestAnimationFrame(() => {
      if (printConfig?.namesEntryEnabled === true) {
        void navigate({ to: "/names" });
        return;
      }
      void navigate({
        to: "/booth",
        search: ticketNamesToBoothSearchRecord([...DEFAULT_BOOTH_TICKET_DISPLAY_NAMES]),
      });
    });
  }, [navigate, printConfig]);

  const [reduceMotion, setReduceMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  const [syncPct, setSyncPct] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 100
      : getNextSyncValue(0),
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduceMotion(mq.matches);
    };
    update();
    mq.addEventListener("change", update);
    return () => {
      mq.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setSyncPct(100);
      return;
    }

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      setSyncPct(getNextSyncValue(now - start));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [reduceMotion]);

  return (
    <div className="relative flex min-h-dvh touch-none flex-col overflow-hidden overscroll-none text-foreground">
      <div className="relative z-10 flex min-h-dvh flex-col px-[max(1rem,calc(1.125rem+2.25rem+0.75rem))] pb-12 pt-8 sm:pt-10">
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-8 lg:gap-10">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="font-bit flex items-end justify-between gap-4 text-white text-2xl">
              <span className="leading-none tracking-[0.04em] uppercase text-base">Display</span>
              <span className="leading-none tabular-nums tracking-[0.02em] text-base">
                {syncPct.toFixed(1)}
                <span className="text-[0.62em] align-top">%</span>
              </span>
            </div>

            <DitherBoothSplashLogo className="hud-splash-logo-animate max-w-[min(100%,15rem)]" />

            <SplashHudTerminal reduceMotion={reduceMotion} />
          </div>

          <header className="font-bit flex min-w-0 shrink-0 flex-col text-white md:items-end md:text-right">
            <span className="wrap-break-word text-base font-bold leading-tight tracking-widest uppercase">
              DITHERBOOTH STANDBY
              <span
                aria-hidden
                className="hud-cursor-blink ml-1 inline-block align-baseline text-[0.85em] opacity-90"
              >
                ▍
              </span>
            </span>
          </header>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-12 py-6 sm:gap-14 sm:py-8">
          <button
            type="button"
            disabled={isLoadingPrintConfig}
            className={cn(
              buttonVariants({ variant: "hud", size: "touch" }),
              "hud-cta-pulse min-h-24 w-full max-w-sm justify-center py-4 font-bit font-bold text-white text-2xl px-56",
              isLoadingPrintConfig && "pointer-events-none opacity-50",
            )}
            onClick={goToExperience}
          >
            Commencer l'expérience
          </button>
        </div>
      </div>
    </div>
  );
};
