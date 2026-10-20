import type { inferRouterOutputs } from "@trpc/server";

import type { engineRouter } from "#internal/router";

export type EngineRouter = typeof engineRouter;
export type EngineOutputs = inferRouterOutputs<EngineRouter>;
