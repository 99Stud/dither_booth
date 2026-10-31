import type { EngineRouter } from "@dither-booth/engine/router.types";

import { DARKROOM_TOKEN_HEADER } from "@dither-booth/shared/darkroom";
import { createTRPCClient, httpLink } from "@trpc/client";

import type { StaffSessionEngine } from "./staff-session.routes";

/** The engine's staff PIN procedures, called with the session's token. */
export function createStaffSessionEngine(
  engineOrigin: string,
): StaffSessionEngine {
  const engine = createTRPCClient<EngineRouter>({
    links: [
      httpLink({
        url: engineOrigin,
        headers: ({ op }) => {
          const token = op.context["token"];
          return typeof token === "string"
            ? { [DARKROOM_TOKEN_HEADER]: token }
            : {};
        },
      }),
    ],
  });

  return {
    unlock: (pin) => engine.booth.unlockDarkroom.mutate({ pin }),
    lock: (token) =>
      engine.booth.lockDarkroom.mutate(undefined, { context: { token } }),
    getSession: (token) =>
      engine.booth.getDarkroomSession.query(undefined, { context: { token } }),
  };
}
