import { browserAutomation } from "#domains/browser-automation/index";
import { imageManipulation } from "#domains/image-manipulation/index";
import { printer } from "#domains/printer/index";

import { router } from "./trpc";

export const apiRouter = router({
  ...printer,
  ...imageManipulation,
  ...browserAutomation,
});
