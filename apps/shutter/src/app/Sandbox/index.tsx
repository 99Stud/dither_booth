import type { FC } from "react";

import type { InteractiveBackgroundOptions } from "#components/misc/InteractiveBackground/index";

import { InteractiveBackground } from "#components/misc/InteractiveBackground/index";

const interactiveBackgroundOptions = {
  background: "fluid",
} satisfies InteractiveBackgroundOptions;

export const Sandbox: FC = () => {
  return <InteractiveBackground options={interactiveBackgroundOptions} />;
};
