import type z from "zod";

import type { runtimeProcessManagerSchema } from "./process-manager.constants";

export type RuntimeProcessManager = z.infer<typeof runtimeProcessManagerSchema>;
