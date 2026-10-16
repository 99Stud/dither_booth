import type { KioskCommand } from "@dither-booth/shared/kiosk";

import { describe, expect, test } from "bun:test";

import type { TRPCContext } from "#lib/trpc/trpc.types";

import { createTestDb } from "#db/internal/db.test-utils";
import { createDarkroomAccessStub } from "#domains/darkroom/internal/darkroom.test-utils";
import { engineRouter } from "#internal/router";
import { createInitialPuppeteerState } from "#lib/puppeteer/puppeteer.utils";

import { createKioskChannel, type KioskChannel } from "./kiosk.channel";
import { createKioskMaintenance } from "./kiosk.maintenance";

const RELOAD: KioskCommand = {
  type: "reload",
  mode: "when-idle",
  commandId: "command-1",
};

const page = (pageId: string) => ({
  pageId,
  deviceId: `device-${pageId}`,
  screen: "shutter" as const,
});

describe("createKioskChannel", () => {
  test("a broadcast reaches every connected page and reports how many", async () => {
    const channel = createKioskChannel();
    const first = channel.subscribe(page("a"));
    const second = channel.subscribe(page("b"));

    expect(channel.broadcast(RELOAD)).toBe(2);
    expect((await first.next()).value).toEqual(RELOAD);
    expect((await second.next()).value).toEqual(RELOAD);
  });

  test("lists connected pages and drops one when it disconnects", () => {
    const channel = createKioskChannel();
    const controller = new AbortController();
    channel.subscribe(page("a"), controller.signal);
    channel.subscribe(page("b"));

    expect(channel.listPages().map((entry) => entry.pageId)).toEqual([
      "a",
      "b",
    ]);
    expect(channel.listPages()[0]?.connectedAt).toBeInstanceOf(Date);

    controller.abort();

    expect(channel.listPages().map((entry) => entry.pageId)).toEqual(["b"]);
    expect(channel.broadcast(RELOAD)).toBe(1);
  });

  test("an aborted stream ends instead of throwing", async () => {
    const channel = createKioskChannel();
    const controller = new AbortController();
    const stream = channel.subscribe(page("a"), controller.signal);
    const pending = stream.next();

    controller.abort();

    expect(await pending).toEqual({ done: true, value: undefined });
  });

  test("a page that was already disconnected is never listed", () => {
    const channel = createKioskChannel();

    channel.subscribe(page("a"), AbortSignal.abort());

    expect(channel.listPages()).toEqual([]);
  });

  test("a page's report is listed with it, until it disconnects", () => {
    const channel = createKioskChannel();
    const controller = new AbortController();
    channel.subscribe(page("a"), controller.signal);
    const camera = {
      status: "error",
      error: "Camera permission denied.",
    } as const;

    expect(channel.listPages()[0]).toMatchObject({
      camera: null,
      maintenance: false,
      reportedAt: null,
    });
    expect(channel.reportStatus("a", { camera, maintenance: false })).toBe(
      true,
    );
    expect(channel.listPages()[0]?.camera).toEqual(camera);
    expect(channel.listPages()[0]?.reportedAt).toBeInstanceOf(Date);

    controller.abort();
    expect(channel.reportStatus("a", { camera, maintenance: false })).toBe(
      false,
    );
    expect(channel.listPages()).toEqual([]);
  });

  test("a report for a page that never subscribed is refused", () => {
    expect(
      createKioskChannel().reportStatus("ghost", {
        camera: null,
        maintenance: false,
      }),
    ).toBe(false);
  });

  test("a broadcast with no page connected reaches no one", () => {
    expect(createKioskChannel().broadcast(RELOAD)).toBe(0);
  });

  test("a page gets its initial command before the live ones", async () => {
    const channel = createKioskChannel();
    const initial: KioskCommand = {
      type: "maintenance",
      enabled: true,
      commandId: "initial",
    };
    const stream = channel.subscribe(page("a"), undefined, initial);
    channel.broadcast(RELOAD);

    expect((await stream.next()).value).toEqual(initial);
    expect((await stream.next()).value).toEqual(RELOAD);
  });

  test("commands are not replayed to pages that connect later", async () => {
    const channel = createKioskChannel();
    channel.broadcast(RELOAD);

    const late = channel.subscribe(page("late"));
    const next = { ...RELOAD, commandId: "command-2" };
    channel.broadcast(next);

    expect((await late.next()).value).toEqual(next);
  });
});

describe("kiosk channel through the router", () => {
  const ADMIN_ORIGIN = "https://admin.local";

  function createCaller(
    kioskChannel: KioskChannel,
    requestOrigin: string,
    kioskMaintenance = createKioskMaintenance({ db: createTestDb().db }),
  ) {
    const unreachable = () => {
      throw new Error("The kiosk channel needs none of this.");
    };
    const context = {
      adminOrigin: ADMIN_ORIGIN,
      allowedHostnames: [],
      db: new Proxy({}, { get: unreachable }) as TRPCContext["db"],
      darkroomAccess: createDarkroomAccessStub(),
      kioskChannel,
      kioskMaintenance,
      mode: "production",
      processManager: "unknown",
      puppeteerLifecycle: {
        close: unreachable,
        getCurrent: unreachable,
        initialize: unreachable,
        restart: unreachable,
        whenReady: unreachable,
      },
      puppeteerState: createInitialPuppeteerState(),
      requestOrigin,
    } satisfies TRPCContext;

    return engineRouter.createCaller(context);
  }

  test("the admin's reload reaches the subscribed kiosk page", async () => {
    const kioskChannel = createKioskChannel();
    const kiosk = createCaller(kioskChannel, "https://192.168.1.10:3000");
    const admin = createCaller(kioskChannel, ADMIN_ORIGIN);

    const commands = await kiosk.booth.onKioskCommand(page("kiosk"));
    const iterator = commands[Symbol.asyncIterator]();
    await iterator.next(); // The maintenance snapshot.
    const received = iterator.next();
    // The procedure registers the page once its stream starts.
    await Bun.sleep(0);

    expect(await admin.ops.reloadKiosk({ mode: "now" })).toEqual({
      delivered: 1,
    });
    expect((await received).value).toMatchObject({
      type: "reload",
      mode: "now",
    });

    await iterator.return?.();
    expect(kioskChannel.listPages()).toEqual([]);
  });

  test("the admin's navigate reaches the subscribed kiosk page", async () => {
    const kioskChannel = createKioskChannel();
    const kiosk = createCaller(kioskChannel, "https://192.168.1.10:3000");
    const admin = createCaller(kioskChannel, ADMIN_ORIGIN);
    const commands = await kiosk.booth.onKioskCommand(page("kiosk"));
    const iterator = commands[Symbol.asyncIterator]();
    await iterator.next(); // The maintenance snapshot.
    const received = iterator.next();
    await Bun.sleep(0);

    expect(await admin.ops.showKioskScreen({ screen: "darkroom" })).toEqual({
      delivered: 1,
    });
    expect((await received).value).toMatchObject({
      type: "navigate",
      screen: "darkroom",
    });
    expect(kioskChannel.listPages()[0]?.screen).toBe("shutter");

    await iterator.return?.();
  });

  test("the kiosk page's camera report reaches admin's health checks", async () => {
    const kioskChannel = createKioskChannel();
    const kiosk = createCaller(kioskChannel, "https://192.168.1.10:3000");
    const commands = await kiosk.booth.onKioskCommand(page("kiosk"));
    const iterator = commands[Symbol.asyncIterator]();
    await iterator.next(); // The maintenance snapshot.
    const received = iterator.next();
    await Bun.sleep(0);

    expect(
      await kiosk.booth.reportKioskStatus({
        pageId: "kiosk",
        camera: { status: "ready", error: null },
        maintenance: false,
      }),
    ).toEqual({ registered: true });
    expect(kioskChannel.listPages()[0]?.camera).toEqual({
      status: "ready",
      error: null,
    });

    kioskChannel.broadcast(RELOAD);
    await received;
    await iterator.return?.();
  });

  test("a page opens with the saved maintenance state", async () => {
    const kioskMaintenance = createKioskMaintenance({ db: createTestDb().db });
    kioskMaintenance.set(true);
    const kiosk = createCaller(
      createKioskChannel(),
      "https://192.168.1.10:3000",
      kioskMaintenance,
    );
    const commands = await kiosk.booth.onKioskCommand(page("kiosk"));
    const iterator = commands[Symbol.asyncIterator]();

    expect((await iterator.next()).value).toMatchObject({
      type: "maintenance",
      enabled: true,
    });

    await iterator.return?.();
  });

  test("the admin's maintenance switch is saved and reaches the page", async () => {
    const kioskChannel = createKioskChannel();
    const kioskMaintenance = createKioskMaintenance({ db: createTestDb().db });
    const kiosk = createCaller(
      kioskChannel,
      "https://192.168.1.10:3000",
      kioskMaintenance,
    );
    const admin = createCaller(kioskChannel, ADMIN_ORIGIN, kioskMaintenance);
    const commands = await kiosk.booth.onKioskCommand(page("kiosk"));
    const iterator = commands[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({ enabled: false });
    const received = iterator.next();
    await Bun.sleep(0);

    expect(
      await admin.ops.setKioskMaintenance({ enabled: true }),
    ).toMatchObject({ delivered: 1, enabled: true });
    expect((await received).value).toMatchObject({
      type: "maintenance",
      enabled: true,
    });
    expect(kioskMaintenance.get().enabled).toBe(true);

    await iterator.return?.();
  });

  test("maintenance is saved even with no page connected", async () => {
    const kioskMaintenance = createKioskMaintenance({ db: createTestDb().db });
    const admin = createCaller(
      createKioskChannel(),
      ADMIN_ORIGIN,
      kioskMaintenance,
    );

    expect(
      await admin.ops.setKioskMaintenance({ enabled: true }),
    ).toMatchObject({ delivered: 0, enabled: true });
    expect(kioskMaintenance.get().enabled).toBe(true);
  });

  test("the kiosk origin cannot send a reload or a navigate", async () => {
    const kiosk = createCaller(
      createKioskChannel(),
      "https://192.168.1.10:3000",
    );

    await expect(kiosk.ops.reloadKiosk({ mode: "now" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      kiosk.ops.showKioskScreen({ screen: "darkroom" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      kiosk.ops.setKioskMaintenance({ enabled: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
