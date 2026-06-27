import { browserAutomation } from "#domains/browser-automation/index";
import { healthz } from "#domains/healthz/index";
import { imageManipulation } from "#domains/image-manipulation/index";
import { printConfiguration } from "#domains/print-configuration/index";
import { receipt } from "#domains/receipt/index";

import { router } from "./trpc";

export const apiRouter = router({
  ...receipt,
  ...printConfiguration,
  ...imageManipulation,
  ...browserAutomation,
  ...healthz,
});
