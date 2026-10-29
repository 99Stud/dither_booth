import type { RouteHandler } from "@dither-booth/browser-server/internal/browser-server.types";
import type { SystemctlOutcome } from "@dither-booth/shared/server/systemctl";

import { logKioskEvent } from "@dither-booth/logging";
import {
  type BoothRollbackTarget,
  type BoothUpdateJob,
  getBoothRollbackUnit,
  getBoothUpdateUnit,
} from "@dither-booth/shared/booth-update";

import { createAdminActionRoute } from "#lib/admin-api/admin-api.routes";
import { ADMIN_UPDATE_LOG_SOURCE } from "#lib/constants";

import type { ReleaseChecker } from "./update.checker";
import type { UpdateActionResult, UpdateSnapshot } from "./update.protocol";

import { updateRequestSchema } from "./update.protocol";
import { buildUpdateSnapshot } from "./update.state";

/*
 * `/admin/update`: the System page's Software panel. Served only under
 * PM2, on the booth. A GET is the snapshot; a POST checks GitHub, or
 * starts the update or rollback unit, which runs `booth update` or
 * `booth rollback` as root and outlives this server's restart.
 */

export type UpdateRouteDeps = {
  /** The release this server runs, read once at start. */
  release: string;
  isRelease: boolean;
  checker: ReleaseChecker;
  /** What `booth update` left on the booth, read for each request. */
  readBooth: () => Promise<{
    job: BoothUpdateJob | null;
    jobRunning: boolean;
    log: string[];
    previous: BoothRollbackTarget;
    freeBytes: number | null;
  }>;
  /** `systemctl --no-block start <unit>`. */
  startUnit: (unit: string) => Promise<SystemctlOutcome>;
  isAllowedOrigin: (origin: string | undefined) => boolean;
};

export function createUpdateRoute(deps: UpdateRouteDeps): RouteHandler {
  const snapshot = async (): Promise<UpdateSnapshot> =>
    buildUpdateSnapshot({
      release: deps.release,
      isRelease: deps.isRelease,
      ...deps.checker.read(),
      ...(await deps.readBooth()),
    });

  const answer = (result: UpdateActionResult, status: number) => ({
    status,
    body: result,
  });

  const refuse = (
    code: "not-permitted" | "busy" | "failed",
    message: string,
    status: number,
  ) => answer({ ok: false, code, message }, status);

  const start = async (unit: string, details: Record<string, unknown>) => {
    const outcome = await deps.startUnit(unit);

    logKioskEvent(
      outcome.ok ? "info" : "warn",
      ADMIN_UPDATE_LOG_SOURCE,
      outcome.ok ? "update-unit-started" : "update-unit-failed",
      {
        details: {
          unit,
          ...details,
          ...(outcome.ok ? {} : { stderr: outcome.stderr }),
        },
      },
    );

    return outcome.ok
      ? answer({ ok: true, snapshot: await snapshot() }, 202)
      : refuse(outcome.code, outcome.message, 503);
  };

  return createAdminActionRoute({
    isAllowedOrigin: deps.isAllowedOrigin,
    read: snapshot,
    request: updateRequestSchema,
    async act(request) {
      if (request.action === "check") {
        await deps.checker.checkNow();
        return answer({ ok: true, snapshot: await snapshot() }, 200);
      }

      const current = await snapshot();

      if (current.jobRunning && current.job) {
        return refuse(
          "busy",
          `An ${current.job.kind} to ${current.job.to} is running.`,
          409,
        );
      }

      if (request.action === "install") {
        return start(getBoothUpdateUnit(request.version), {
          version: request.version,
        });
      }

      if (!current.previous) {
        return refuse(
          "failed",
          "No earlier release on this booth to go back to.",
          409,
        );
      }

      if (current.previous.migrated && request.mode === "keep-db") {
        return refuse(
          "failed",
          `${current.release} changed the database: going back means restoring its backup.`,
          409,
        );
      }

      return start(getBoothRollbackUnit(request.mode), { mode: request.mode });
    },
  });
}
