import type { FC } from "react";

import type { InteractiveBackgroundOptions } from "#components/misc/InteractiveBackground/index";

import { InteractiveBackground } from "#components/misc/InteractiveBackground/index";

const interactiveBackgroundOptions = {
  fluidBackground: {
    simRes: 128,
    dyeRes: 512,
    iterations: 2,
    idleFrames: 240,
  },
} satisfies InteractiveBackgroundOptions;

export const Sandbox: FC = () => {
  return <InteractiveBackground options={interactiveBackgroundOptions} />;
};
