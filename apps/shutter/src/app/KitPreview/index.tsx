import type { FC } from "react";

import {
  KIT_PREVIEW_SURFACES,
  SAMPLE_LOTTERY_STATUS,
  type KitPreviewSurface,
} from "@dither-booth/shared/kit-preview";
import clsx from "clsx";

import { CameraCrt } from "#app/Experience/internal/components/CameraCrt/index";
import { IntroChrome } from "#app/Experience/internal/components/IntroChrome/index";
import { StartExperienceButton } from "#app/Experience/internal/components/StartExperienceButton/index";
import { InteractiveBackground } from "#components/misc/InteractiveBackground/index";
import { useKit } from "#kits/useKit";
import { kitPreviewRoute } from "#lib/router/index";

const noop = () => {};

/**
 * Admin's live preview of the booth screen: the kiosk's own components with
 * sample lottery numbers. No camera, no engine calls, no visit: the start
 * button only pulses. Tickets are previewed on the receipt viewer instead.
 */
export const KitPreview: FC = () => {
  const { surface } = kitPreviewRoute.useSearch();
  const kit = useKit();
  const shown: KitPreviewSurface = KIT_PREVIEW_SURFACES.includes(surface)
    ? surface
    : "landing";

  return (
    <>
      <InteractiveBackground preset={kit.background} />
      {shown === "camera" ? (
        <div
          className={clsx(
            "fixed inset-0 z-10 flex items-center justify-center p-8",
          )}
        >
          <div className={clsx("relative aspect-square h-full shadow-soft")}>
            <CameraCrt>
              {/* Stands in for the guest: preview never opens a camera. */}
              <div
                aria-label="Sample camera picture"
                role="img"
                className={clsx(
                  "h-full w-full flex-1",
                  "bg-linear-to-br from-neutral-300 via-neutral-500 to-neutral-800",
                )}
              />
            </CameraCrt>
          </div>
        </div>
      ) : (
        <>
          <IntroChrome isVisible lotteryStatus={SAMPLE_LOTTERY_STATUS} />
          <StartExperienceButton
            disabled
            isAtOrigin
            isVisible
            onAnimationComplete={noop}
            onStart={noop}
          />
        </>
      )}
    </>
  );
};
