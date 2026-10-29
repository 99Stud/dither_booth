import type {
  BoothRollbackTarget,
  BoothUpdateJob,
} from "@dither-booth/shared/booth-update";

import { describe, expect, it } from "bun:test";

import type { UpdateRouteDeps } from "./update.routes";

import {
  updateActionResultSchema,
  updateSnapshotSchema,
} from "./update.protocol";
import { createUpdateRoute } from "./update.routes";
import { createJobFixture } from "./update.testing";

const ADMIN = "https://ditherbooth.local:3002";

const post = (body: unknown, origin: string | null = ADMIN) =>
  new Request(`${ADMIN}/admin/update`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

const createRoute = ({
  job = null,
  jobRunning = job?.state === "running",
  previous = null,
  release = "0.7.2",
}: {
  job?: BoothUpdateJob | null;
  jobRunning?: boolean;
  previous?: BoothRollbackTarget;
  release?: string;
} = {}) => {
  const started: string[] = [];
  let checks = 0;
  const deps: UpdateRouteDeps = {
    release,
    isRelease: true,
    checker: {
      read: () => ({
        latest: { version: "0.8.0", notes: "", url: "", publishedAt: null },
        check: { state: "ok", checkedAt: null, message: null },
      }),
      checkNow: async () => {
        checks += 1;
      },
      stop: () => {},
    },
    readBooth: async () => ({
      job,
      jobRunning,
      log: [],
      history: job ? [job] : [],
      previous,
      freeBytes: 5 * 1024 ** 3,
    }),
    startUnit: async (unit) => {
      started.push(unit);
      return { ok: true };
    },
    isAllowedOrigin: (origin) => origin === ADMIN,
  };

  return { route: createUpdateRoute(deps), started, checks: () => checks };
};

describe("createUpdateRoute", () => {
  it("serves the snapshot, never cached", async () => {
    const { route } = createRoute();
    const response = await route(new Request(`${ADMIN}/admin/update`));

    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(updateSnapshotSchema.parse(await response?.json())).toMatchObject({
      release: "0.7.2",
      updateAvailable: true,
    });
  });

  it("starts the update unit for the version asked, systemd-escaped", async () => {
    const { route, started } = createRoute();

    expect(
      (await route(post({ action: "install", version: "0.8.0-rc.1" })))?.status,
    ).toBe(202);
    expect(started).toEqual(["ditherbooth-update@0.8.0\\x2drc.1.service"]);
  });

  it("refuses anything that isn't a release version, and another site", async () => {
    const { route, started } = createRoute();

    expect(
      (await route(post({ action: "install", version: "latest; reboot" })))
        ?.status,
    ).toBe(400);
    expect(
      (await route(post({ action: "check" }, "https://evil.example")))?.status,
    ).toBe(403);
    expect(started).toEqual([]);
  });

  it("starts a new job over one a crash left running", async () => {
    const { route, started } = createRoute({
      job: createJobFixture({
        state: "running",
        step: "download",
        process: { pid: 2_147_483_000, bootId: "gone", startedTicks: 0 },
      }),
      jobRunning: false,
    });

    expect(
      (await route(post({ action: "install", version: "0.8.0" })))?.status,
    ).toBe(202);
    expect(started).toEqual(["ditherbooth-update@0.8.0.service"]);
  });

  it("refuses a second job while one runs", async () => {
    const { route, started } = createRoute({
      job: createJobFixture({ state: "running", step: "download" }),
    });
    const response = await route(post({ action: "install", version: "0.8.0" }));

    expect(response?.status).toBe(409);
    expect(
      updateActionResultSchema.parse(await response?.json()),
    ).toMatchObject({
      ok: false,
      code: "busy",
    });
    expect(started).toEqual([]);
  });

  it("rolls back only with the database restored once the newer release migrated it", async () => {
    const { route, started } = createRoute({
      release: "0.8.0",
      previous: {
        release: "0.7.2",
        migrated: true,
        backup: "/mnt/ssd/dither-booth/backups/update-x.sqlite",
        backupTakenAt: "2026-10-29T10:00:00.000Z",
      },
    });

    expect(
      (await route(post({ action: "rollback", mode: "keep-db" })))?.status,
    ).toBe(409);
    expect(
      (await route(post({ action: "rollback", mode: "restore-db" })))?.status,
    ).toBe(202);
    expect(started).toEqual(["ditherbooth-rollback@restore\\x2ddb.service"]);
  });

  it("offers no rollback the CLI would refuse", async () => {
    const { route, started } = createRoute({ release: "0.8.0" });

    expect(
      (await route(post({ action: "rollback", mode: "keep-db" })))?.status,
    ).toBe(409);
    expect(started).toEqual([]);
  });

  it("checks GitHub when asked", async () => {
    const { route, checks } = createRoute();

    expect((await route(post({ action: "check" })))?.status).toBe(200);
    expect(checks()).toBe(1);
  });
});
