import { getNextSyncValue } from "#app/Splash/internal/SplashHud.utils.ts";
import { SplashHudTerminal } from "#app/Splash/internal/SplashHudTerminal.tsx";
import { buttonVariants } from "#components/ui/button.tsx";
import { HudBackground } from "#components/backgrounds/HudBackground/HudBackground.tsx";
import { requestKioskFullscreen } from "#lib/kiosk-fullscreen.ts";
import { navigateWithViewTransition } from "#lib/navigate-with-view-transition.ts";
import { cn } from "#lib/utils.ts";
import { useNavigate } from "@tanstack/react-router";
import { type FC, useCallback, useEffect, useState } from "react";

import ditherboothLogo from "../../../assets/ditherbooth_logo.png";

export const Splash: FC = () => {
  const navigate = useNavigate();

  const goToNames = useCallback(async () => {
    await requestKioskFullscreen();
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
    <div className="relative flex min-h-dvh touch-none flex-col overflow-hidden overscroll-none bg-background text-foreground">
      <HudBackground />

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

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-12 py-8 sm:gap-14">
          <div className="flex flex-col items-center gap-6 sm:gap-8">
            <div className="flex items-center gap-3 font-mono text-[9px] text-primary uppercase sm:text-[10px]">
              <span className="hud-text-glow-orange tracking-widest">Display</span>
              <span className="hud-text-glow-orange-soft text-primary/40">·</span>
              <span className="hud-text-glow-orange tabular-nums tracking-wider">
                SYNC {syncPct.toFixed(1)}%
              </span>
            </div>

            <img
              src={ditherboothLogo}
              alt="Dither Booth"
              className="hud-splash-logo-animate w-full max-w-xs object-contain sm:max-w-md"
              draggable={false}
            />
          </div>

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
  );
};
