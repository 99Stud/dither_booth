import type { RouteHandler } from "@dither-booth/browser-server/internal/browser-server.types";

import { logKioskEvent } from "@dither-booth/logging";
import {
  type BoothUpdateJob,
  getBoothRollbackUnit,
  getBoothUpdateUnit,
} from "@dither-booth/shared/booth-update";

import type { SystemctlOutcome } from "#lib/systemctl/systemctl.server";

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

const NO_STORE = { "cache-control": "no-store" } as const;

export type UpdateRouteDeps = {
  /** The release this server runs, read once at start. */
  release: string;
  isRelease: boolean;
  checker: ReleaseChecker;
  readJob: () => Promise<BoothUpdateJob | null>;
  readHistory: () => Promise<BoothUpdateJob[]>;
  /** `systemctl --no-block start <unit>`. */
  startUnit: (unit: string) => Promise<SystemctlOutcome>;
  /** The page's origin check: another site must not update the booth. */
  isAllowedOrigin: (origin: string | undefined) => boolean;
};

export function createUpdateRoute(deps: UpdateRouteDeps): RouteHandler {
  const snapshot = async (): Promise<UpdateSnapshot> => {
    const [job, history] = await Promise.all([
      deps.readJob(),
      deps.readHistory(),
    ]);

    return buildUpdateSnapshot({
      release: deps.release,
      isRelease: deps.isRelease,
      ...deps.checker.read(),
      job,
      history,
    });
  };

  const answer = (result: UpdateActionResult, status: number) =>
    Response.json(result, { headers: NO_STORE, status });

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

  return async (req) => {
    if (req.method === "GET") {
      return Response.json(await snapshot(), { headers: NO_STORE });
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!deps.isAllowedOrigin(req.headers.get("origin") ?? undefined)) {
      return new Response("Origin not allowed", { status: 403 });
    }

    const request = updateRequestSchema.safeParse(
      await req.json().catch(() => undefined),
    );

    if (!request.success) {
      return new Response("Unknown update action", { status: 400 });
    }

    if (request.data.action === "check") {
      await deps.checker.checkNow();
      return answer({ ok: true, snapshot: await snapshot() }, 200);
    }

    const current = await snapshot();

    if (current.job?.state === "running") {
      return refuse(
        "busy",
        `An ${current.job.kind} to ${current.job.to} is running.`,
        409,
      );
    }

    if (request.data.action === "install") {
      return start(getBoothUpdateUnit(request.data.version), {
        version: request.data.version,
      });
    }

    const { mode } = request.data;

    if (!current.previous) {
      return refuse(
        "failed",
        "No earlier release on this booth to go back to.",
        409,
      );
    }

    if (current.previous.migrated && mode === "keep-db") {
      return refuse(
        "failed",
        `${current.release} changed the database: going back means restoring its backup.`,
        409,
      );
    }

    return start(getBoothRollbackUnit(mode), { mode });
  };
}
