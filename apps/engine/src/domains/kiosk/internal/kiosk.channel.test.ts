import type { KioskCommand } from "@dither-booth/shared/kiosk";

import { describe, expect, test } from "bun:test";

import type { TRPCContext } from "#lib/trpc/trpc.types";

import { createTestDb } from "#db/internal/db.test-utils";
import { createDarkroomAccessStub } from "#domains/darkroom/internal/darkroom.test-utils";
import { createHubReporterStub } from "#domains/hub/internal/hub.test-utils";
import { createStubPrinter } from "#domains/printer/internal/printer.test-utils";
import { engineRouter } from "#internal/router";
import { createInitialPuppeteerState } from "#lib/puppeteer/puppeteer.utils";

import {
  type CameraPreview,
  createCameraPreview,
} from "./kiosk.camera-preview";
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

  test("a page gets its opening commands, in order, before the live ones", async () => {
    const channel = createKioskChannel();
    const initial: KioskCommand[] = [
      { type: "maintenance", enabled: true, commandId: "initial" },
      { type: "release", release: "0.8.0", commandId: "release" },
    ];
    const stream = channel.subscribe(page("a"), undefined, initial);
    channel.broadcast(RELOAD);

    expect((await stream.next()).value).toEqual(initial[0]);
    expect((await stream.next()).value).toEqual(initial[1]);
    expect((await stream.next()).value).toEqual(RELOAD);
  });

  test("reports a page once when it disconnects", () => {
    const channel = createKioskChannel();
    const left: string[] = [];
    const stop = channel.onPageLeft((pageId) => left.push(pageId));
    const controller = new AbortController();
    channel.subscribe(page("a"), controller.signal);

    controller.abort();
    stop();
    channel.subscribe(page("b"), AbortSignal.timeout(0));

    expect(left).toEqual(["a"]);
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

  // One live view registry per channel, as the engine has one per process.
  const cameraPreviews = new WeakMap<KioskChannel, CameraPreview>();
  const cameraPreviewFor = (kioskChannel: KioskChannel) => {
    const existing = cameraPreviews.get(kioskChannel);
    if (existing) return existing;
    const created = createCameraPreview({
      kioskChannel,
      iceServers: [],
      maxViewers: 2,
      maxDurationMs: 60_000,
    });
    cameraPreviews.set(kioskChannel, created);
    return created;
  };

  function createCaller(
    kioskChannel: KioskChannel,
    requestOrigin: string,
    kioskMaintenance = createKioskMaintenance({
      db: createTestDb().db,
      kioskChannel,
    }),
    db?: TRPCContext["db"],
  ) {
    const unreachable = () => {
      throw new Error("The kiosk channel needs none of this.");
    };
    const context = {
      adminOrigin: ADMIN_ORIGIN,
      allowedHostnames: [],
      db: db ?? (new Proxy({}, { get: unreachable }) as TRPCContext["db"]),
      darkroomAccess: createDarkroomAccessStub(),
      hubReporter: createHubReporterStub(),
      kioskChannel,
      kioskMaintenance,
      release: "0.0.0-test",
      cameraPreview: cameraPreviewFor(kioskChannel),
      mode: "production",
      network: {} as TRPCContext["network"],
      setupServerAccess: { verify: () => false },
      printer: createStubPrinter(),
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
      tickets: new Proxy({}, { get: unreachable }) as TRPCContext["tickets"],
      visits: new Proxy({}, { get: unreachable }) as TRPCContext["visits"],
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
    await iterator.next(); // The release.
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

  test("saving the event's kit tells the kiosk to re-read it", async () => {
    const { db, sqlite } = createTestDb();
    const kioskChannel = createKioskChannel();
    const kioskMaintenance = createKioskMaintenance({ db, kioskChannel });
    const kiosk = createCaller(
      kioskChannel,
      "https://192.168.1.10:3000",
      kioskMaintenance,
      db,
    );
    const admin = createCaller(
      kioskChannel,
      ADMIN_ORIGIN,
      kioskMaintenance,
      db,
    );

    try {
      await admin.config.createEvent({ name: "Halloween" });
      const commands = await kiosk.booth.onKioskCommand(page("kiosk"));
      const iterator = commands[Symbol.asyncIterator]();
      await iterator.next(); // The maintenance snapshot.
      await iterator.next(); // The release.
      const received = iterator.next();
      await Bun.sleep(0);

      const saved = await admin.config.updateKitSettings({
        kitId: "tartines",
        settings: { copy: { "landing.start": "Tap to scare" } },
      });

      expect(saved.delivered).toBe(1);
      expect((await received).value).toMatchObject({ type: "kit-updated" });
      expect((await kiosk.booth.getKit()).copy["landing.start"]).toBe(
        "Tap to scare",
      );
      await expect(
        kiosk.config.updateKitSettings({ kitId: "tartines", settings: {} }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      await iterator.return?.();
    } finally {
      sqlite.close();
    }
  });

  test("switching the lottery tells the kiosk to re-read its status", async () => {
    const { db, sqlite } = createTestDb();
    const kioskChannel = createKioskChannel();
    const kioskMaintenance = createKioskMaintenance({ db, kioskChannel });
    const kiosk = createCaller(
      kioskChannel,
      "https://192.168.1.10:3000",
      kioskMaintenance,
      db,
    );
    const admin = createCaller(
      kioskChannel,
      ADMIN_ORIGIN,
      kioskMaintenance,
      db,
    );

    try {
      await admin.config.createEvent({ name: "Halloween" });
      const commands = await kiosk.booth.onKioskCommand(page("kiosk"));
      const iterator = commands[Symbol.asyncIterator]();
      await iterator.next(); // The maintenance snapshot.
      await iterator.next(); // The release.
      const received = iterator.next();
      await Bun.sleep(0);

      await admin.config.updateLotterySettings({
        enabled: true,
        noWinWeight: 50,
        winCooldownMinutes: 5,
        printLoserTicket: false,
      });

      expect((await received).value).toMatchObject({
        type: "lottery-updated",
      });
      expect((await kiosk.booth.getLotteryStatus()).enabled).toBe(true);

      await iterator.return?.();
    } finally {
      sqlite.close();
    }
  });

  test("a new event has the kiosk re-read kit and lottery; a failed save, nothing", async () => {
    const { db, sqlite } = createTestDb();
    const channel = createKioskChannel();
    const sent: KioskCommand["type"][] = [];
    const kioskChannel: KioskChannel = {
      ...channel,
      broadcast: (command) => {
        sent.push(command.type);
        return channel.broadcast(command);
      },
    };
    const kioskMaintenance = createKioskMaintenance({ db, kioskChannel });
    const admin = createCaller(
      kioskChannel,
      ADMIN_ORIGIN,
      kioskMaintenance,
      db,
    );

    try {
      await admin.config.createEvent({ name: "Halloween" });
      expect(sent).toEqual(["kit-updated", "lottery-updated"]);

      sent.length = 0;
      await expect(
        admin.config.deletePrize({ prizeId: "missing" }),
      ).rejects.toThrow();
      expect(sent).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  test("the admin's navigate reaches the subscribed kiosk page", async () => {
    const kioskChannel = createKioskChannel();
    const kiosk = createCaller(kioskChannel, "https://192.168.1.10:3000");
    const admin = createCaller(kioskChannel, ADMIN_ORIGIN);
    const commands = await kiosk.booth.onKioskCommand(page("kiosk"));
    const iterator = commands[Symbol.asyncIterator]();
    await iterator.next(); // The maintenance snapshot.
    await iterator.next(); // The release.
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
    await iterator.next(); // The release.
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

  test("a page opens with the saved maintenance state, then the release", async () => {
    const kioskChannel = createKioskChannel();
    const kioskMaintenance = createKioskMaintenance({
      db: createTestDb().db,
      kioskChannel,
    });
    kioskMaintenance.setManual(true);
    const kiosk = createCaller(
      kioskChannel,
      "https://192.168.1.10:3000",
      kioskMaintenance,
    );
    const commands = await kiosk.booth.onKioskCommand(page("kiosk"));
    const iterator = commands[Symbol.asyncIterator]();

    expect((await iterator.next()).value).toMatchObject({
      type: "maintenance",
      enabled: true,
    });
    expect((await iterator.next()).value).toMatchObject({
      type: "release",
      release: "0.0.0-test",
    });

    await iterator.return?.();
  });

  test("the admin's maintenance switch is saved and reaches the page", async () => {
    const kioskChannel = createKioskChannel();
    const kioskMaintenance = createKioskMaintenance({
      db: createTestDb().db,
      kioskChannel,
    });
    const kiosk = createCaller(
      kioskChannel,
      "https://192.168.1.10:3000",
      kioskMaintenance,
    );
    const admin = createCaller(kioskChannel, ADMIN_ORIGIN, kioskMaintenance);
    const commands = await kiosk.booth.onKioskCommand(page("kiosk"));
    const iterator = commands[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({ enabled: false });
    await iterator.next(); // The release.
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
    const kioskChannel = createKioskChannel();
    const kioskMaintenance = createKioskMaintenance({
      db: createTestDb().db,
      kioskChannel,
    });
    const admin = createCaller(kioskChannel, ADMIN_ORIGIN, kioskMaintenance);

    expect(
      await admin.ops.setKioskMaintenance({ enabled: true }),
    ).toMatchObject({ delivered: 0, enabled: true });
    expect(kioskMaintenance.get().enabled).toBe(true);
  });

  test("a live view goes from admin to the camera page and back", async () => {
    const kioskChannel = createKioskChannel();
    const kiosk = createCaller(kioskChannel, "https://192.168.1.10:3000");
    const admin = createCaller(kioskChannel, ADMIN_ORIGIN);
    const commands = await kiosk.booth.onKioskCommand(page("kiosk"));
    const pageStream = commands[Symbol.asyncIterator]();
    await pageStream.next(); // The maintenance snapshot.
    await pageStream.next(); // The release.
    await kiosk.booth.reportKioskStatus({
      pageId: "kiosk",
      camera: { status: "ready", error: null },
      maintenance: false,
    });

    const view = await admin.ops.watchCamera({ sessionId: "s1" });
    const viewStream = view[Symbol.asyncIterator]();
    expect((await viewStream.next()).value).toMatchObject({ kind: "start" });
    expect((await pageStream.next()).value).toMatchObject({
      type: "camera",
      sessionId: "s1",
      signal: { kind: "start" },
    });

    expect(
      await kiosk.booth.sendKioskCameraSignal({
        pageId: "kiosk",
        sessionId: "s1",
        signal: { kind: "offer", sdp: "v=0" },
      }),
    ).toEqual({ delivered: true });
    expect((await viewStream.next()).value).toEqual({
      kind: "offer",
      sdp: "v=0",
    });

    expect(
      await admin.ops.sendCameraSignal({
        sessionId: "s1",
        signal: { kind: "answer", sdp: "v=0" },
      }),
    ).toEqual({ delivered: true });
    expect((await pageStream.next()).value).toMatchObject({
      signal: { kind: "answer" },
    });

    // Stopping the view tells the page.
    await viewStream.return?.();
    expect((await pageStream.next()).value).toMatchObject({
      signal: { kind: "end", reason: "viewer-left" },
    });
    await pageStream.return?.();
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
    await expect(
      kiosk.ops.sendCameraSignal({
        sessionId: "s1",
        signal: { kind: "end", reason: "viewer-left" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
