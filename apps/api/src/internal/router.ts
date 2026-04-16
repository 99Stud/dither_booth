import { browserAutomation } from "#domains/browser-automation/index.ts";
import { imageManipulation } from "#domains/image-manipulation/index.ts";
import { lottery } from "#domains/lottery/index.ts";
import { printer } from "#domains/printer/index.ts";

import { router } from "./trpc";

export const apiRouter = router({
  ...printer,
  ...imageManipulation,
  ...browserAutomation,
  ...lottery,
});
