import type { LotteryStatus } from "@dither-booth/shared/lottery";
import type { ComponentProps, FC } from "react";

import { IntroChrome } from "../IntroChrome/index";
import { StartExperienceButton } from "../StartExperienceButton/index";

/**
 * The booth's landing screen, shared by the kiosk and admin's kit preview so
 * the preview can't drift from what guests see. The kit's text, fonts and
 * logos come from the kit in context.
 */
export const KitLanding: FC<{
  isIntroVisible: boolean;
  lotteryStatus: LotteryStatus | undefined;
  start: ComponentProps<typeof StartExperienceButton>;
}> = ({ isIntroVisible, lotteryStatus, start }) => (
  <>
    <IntroChrome isVisible={isIntroVisible} lotteryStatus={lotteryStatus} />
    <StartExperienceButton {...start} />
  </>
);
