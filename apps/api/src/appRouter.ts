import { browserAutomation } from "./domains/browser-automation";
import { imageManipulation } from "./domains/image-manipulation";
import { printer } from "./domains/printer";
import { router } from "./trpc";

export const appRouter = router({
  ...printer,
  ...imageManipulation,
  ...browserAutomation,
});

export type AppRouter = typeof appRouter;
