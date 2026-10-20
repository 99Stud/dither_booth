import type { FC } from "react";

import { BACKGROUND_PRESETS } from "@dither-booth/shared/backgrounds";

import { InteractiveBackground } from "#components/misc/InteractiveBackground/index";

export const Sandbox: FC = () => {
  return <InteractiveBackground preset={BACKGROUND_PRESETS.fluid} />;
};
