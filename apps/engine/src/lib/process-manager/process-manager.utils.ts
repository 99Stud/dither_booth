import type { RuntimeProcessManager } from "./process-manager.types";

import { configuredProcessManagerSchema } from "./process-manager.constants";

export function getRuntimeProcessManager(
  value = Bun.env.PROCESS_MANAGER,
): RuntimeProcessManager {
  const parsed = configuredProcessManagerSchema.safeParse(value);

  return parsed.success ? parsed.data : "unknown";
}
