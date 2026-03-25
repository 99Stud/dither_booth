import { imageManipulation } from "./domains/image-manipulation";
import { printer } from "./domains/printer";
import { router } from "./trpc";

export const appRouter = router({
  ...printer,
  ...imageManipulation,
});

export type AppRouter = typeof appRouter;
