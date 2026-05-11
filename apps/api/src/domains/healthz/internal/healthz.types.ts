import type z from "zod";

import type { healthzModeSchema } from "./healthz.constants";

export type HealthzMode = z.infer<typeof healthzModeSchema>;
