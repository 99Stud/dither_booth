import { getNextSyncValue } from "#app/Splash/internal/SplashHud.utils.ts";
import { SplashHudSignalChart } from "#app/Splash/internal/SplashHudSignalChart.tsx";
import { SplashHudTerminal } from "#app/Splash/internal/SplashHudTerminal.tsx";
import { buttonVariants } from "#components/ui/button.tsx";
import { navigateWithViewTransition } from "#lib/navigate-with-view-transition.ts";
import { cn } from "#lib/utils.ts";
import { useNavigate } from "@tanstack/react-router";
import { type FC, useCallback, useEffect, useState } from "react";

import ditherboothLogo from "../../../assets/ditherbooth_logo.png";

export const Splash: FC = () => {
  const navigate = useNavigate();

  const goToNames = useCallback(() => {
    navigateWithViewTransition(navigate, { to: "/names" });
  }, [navigate]);

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
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 hud-grid-bg hud-splash-grid-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 hud-cyan-columns hud-splash-cyan-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 hud-scanlines hud-splash-scan-animate"
      />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 h-[min(26vh,220px)] mask-[linear-gradient(to_bottom,transparent_0%,oklch(0_0_0)_38%)] opacity-[0.28]"
      >
        <SplashHudSignalChart reduceMotion={reduceMotion} />
      </div>

      <div
        aria-hidden
        className="pointer-events-none fixed top-0 right-0 left-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent hud-splash-rail-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed right-0 bottom-0 left-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent hud-splash-rail-animate"
      />

      <div
        aria-hidden
        className="pointer-events-none fixed top-6 left-6 size-12 border-l-2 border-t-2 border-primary/70 hud-splash-bracket-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed top-6 right-6 size-12 border-r-2 border-t-2 border-primary/70 hud-splash-bracket-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-6 left-6 size-12 border-b-2 border-l-2 border-primary/70 hud-splash-bracket-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed right-6 bottom-6 size-12 border-b-2 border-r-2 border-primary/70 hud-splash-bracket-animate"
      />

      <div className="relative z-10 flex min-h-dvh flex-col px-[max(1.25rem,calc(1.5rem+3rem+0.75rem))] pb-14 pt-12 sm:pt-14">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <SplashHudTerminal reduceMotion={reduceMotion} />

          <header className="font-heading flex min-w-0 shrink-0 flex-col gap-1 text-[10px] tracking-[0.28em] uppercase lg:items-end lg:text-right sm:text-[11px]">
            <span className="hud-text-glow-orange-soft wrap-break-word text-muted-foreground">
              Imaging subsystem // Photo unit
            </span>
            <span className="hud-text-glow-orange wrap-break-word text-primary">
              DITHER-BOOTH · STANDBY
              <span
                aria-hidden
                className="hud-cursor-blink ml-0.5 inline-block align-baseline font-mono text-[0.85em]"
              >
                ▍
              </span>
            </span>
          </header>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-10 py-8">
          <div className="relative w-full max-w-[min(100%,720px)]">
            <div
              aria-hidden
              className="absolute inset-0 -m-3 border border-primary/25 hud-splash-frame-outer-animate"
            />
            <div aria-hidden className="absolute inset-0 -m-1.5 border border-primary/45" />
            <div className="relative border-2 border-primary/55 bg-black/40 p-6 sm:p-10">
              <div className="mb-4 flex items-center justify-between gap-2 font-mono text-[9px] text-primary uppercase sm:text-[10px]">
                <span className="hud-text-glow-orange tracking-widest">Display</span>
                <span className="hud-text-glow-orange tabular-nums tracking-wider">
                  SYNC {syncPct.toFixed(1)}%
                </span>
              </div>

              <img
                src={ditherboothLogo}
                alt="Dither Booth"
                className="hud-splash-logo-animate mx-auto mt-6 w-full max-w-md object-contain"
                draggable={false}
              />
              <p className="hud-text-glow-orange-soft mt-5 text-center font-mono text-[10px] leading-relaxed tracking-wide text-muted-foreground sm:text-xs">
                Image pipeline nominal · Awaiting pilot
              </p>
            </div>
          </div>

          <div className="flex w-full max-w-md flex-col items-center gap-5">
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "hud", size: "touch" }),
                "hud-cta-pulse w-full max-w-sm justify-center",
              )}
              onClick={goToNames}
            >
              Commencer l'expérience
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
