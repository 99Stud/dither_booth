import { print } from "./printer";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  print: publicProcedure.mutation(() => {
    print();
  }),
});

export type AppRouter = typeof appRouter;
