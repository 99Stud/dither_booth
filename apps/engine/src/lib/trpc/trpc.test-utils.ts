import type {
  EngineServices,
  RequestCredentials,
  TRPCContext,
} from "#lib/trpc/trpc.types";

import { createAdminOrigins } from "#internal/trpc";

export const TEST_ADMIN_ORIGIN = "https://admin.local";

/** A service no test set up: touching it fails the test that did. */
const unset = <T extends object>(name: string): T =>
  new Proxy({} as T, {
    get() {
      throw new Error(`${name} is not set up for this test.`);
    },
  });

/**
 * A context for calling the router directly. A test passes the services it
 * uses and the request it makes; every other service throws when touched.
 * The admin is `TEST_ADMIN_ORIGIN`; the request carries no origin and no
 * token unless the test gives one.
 */
export function createTestContext({
  request = {},
  ...services
}: Partial<EngineServices> & {
  request?: RequestCredentials;
} = {}): TRPCContext {
  return {
    adminOrigins: createAdminOrigins({
      adminOrigin: TEST_ADMIN_ORIGIN,
      allowedHostnames: [],
    }),
    cameraPreview: unset("cameraPreview"),
    darkroomAccess: unset("darkroomAccess"),
    db: unset("db"),
    hubReporter: unset("hubReporter"),
    kioskChannel: unset("kioskChannel"),
    kioskMaintenance: unset("kioskMaintenance"),
    mode: "production",
    network: unset("network"),
    printer: unset("printer"),
    processManager: "unknown",
    puppeteerLifecycle: unset("puppeteerLifecycle"),
    setupServerAccess: unset("setupServerAccess"),
    tickets: unset("tickets"),
    ...services,
    request,
  };
}
