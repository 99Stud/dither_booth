import type { FC } from "react";

import { InteractiveBackground } from "#components/misc/InteractiveBackground/index";

const interactiveBackgroundOptions = {
  fluidBackground: {
    simRes: 128,
    dyeRes: 512,
    iterations: 2,
    idleFrames: 240,
  },
};

export const Sandbox: FC = () => {
  return <InteractiveBackground options={interactiveBackgroundOptions} />;
};
