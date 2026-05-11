import { browserAutomation } from "#domains/browser-automation/index";
import { healthz } from "#domains/healthz/index";
import { imageManipulation } from "#domains/image-manipulation/index";
import { printer } from "#domains/printer/index";

import { router } from "./trpc";

export const apiRouter = router({
  ...printer,
  ...imageManipulation,
  ...browserAutomation,
  ...healthz,
});
