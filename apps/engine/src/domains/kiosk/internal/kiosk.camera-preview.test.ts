import type { KioskCommand } from "@dither-booth/shared/kiosk";

import { describe, expect, test } from "bun:test";

import { createCameraPreview } from "./kiosk.camera-preview";
import { createKioskChannel } from "./kiosk.channel";

const OFFER = { kind: "offer", sdp: "v=0 offer" } as const;
const ANSWER = { kind: "answer", sdp: "v=0 answer" } as const;

function setup({ maxDurationMs = 60_000 } = {}) {
  const kioskChannel = createKioskChannel();
  const preview = createCameraPreview({
    kioskChannel,
    iceServers: [{ urls: "stun:stun.example" }],
    maxViewers: 2,
    maxDurationMs,
  });

  /** A kiosk page on `screen`, whose camera is ready unless told otherwise. */
  const connectPage = (
    pageId: string,
    { screen = "shutter", cameraReady = true } = {},
  ) => {
    const controller = new AbortController();
    const commands = kioskChannel.subscribe(
      { pageId, deviceId: `device-${pageId}`, screen: screen as "shutter" },
      controller.signal,
    );
    kioskChannel.reportStatus(pageId, {
      camera: cameraReady ? { status: "ready", error: null } : null,
      maintenance: false,
    });
    const next = async () =>
      (await commands.next()).value as Extract<
        KioskCommand,
        { type: "camera" }
      >;

    return { controller, next };
  };

  return { connectPage, kioskChannel, preview };
}

describe("createCameraPreview", () => {
  test("relays a whole session between the viewer and the camera page", async () => {
    const { connectPage, preview } = setup();
    const page = connectPage("kiosk");
    const viewer = preview.watch("s1");

    expect((await viewer.next()).value).toEqual({
      kind: "start",
      iceServers: [{ urls: "stun:stun.example" }],
    });
    expect(await page.next()).toMatchObject({
      type: "camera",
      pageId: "kiosk",
      sessionId: "s1",
      signal: { kind: "start" },
    });

    expect(preview.fromPage("kiosk", "s1", OFFER)).toBe(true);
    expect((await viewer.next()).value).toEqual(OFFER);

    expect(preview.fromViewer("s1", ANSWER)).toBe(true);
    expect((await page.next()).signal).toEqual(ANSWER);
    expect(preview.countViewers()).toBe(1);
  });

  test("ends straight away when no page has a working camera", async () => {
    const { connectPage, preview } = setup();
    connectPage("darkroom", { screen: "darkroom" });
    connectPage("broken", { cameraReady: false });

    const viewer = preview.watch("s1");

    expect((await viewer.next()).value).toEqual({
      kind: "end",
      reason: "no-camera",
    });
    expect((await viewer.next()).done).toBe(true);
    expect(preview.countViewers()).toBe(0);
  });

  test("turns a third viewer away", async () => {
    const { connectPage, preview } = setup();
    connectPage("kiosk");
    preview.watch("s1");
    preview.watch("s2");

    expect((await preview.watch("s3").next()).value).toEqual({
      kind: "end",
      reason: "busy",
    });
    expect(preview.countViewers()).toBe(2);
  });

  test("ignores a page that isn't the session's", async () => {
    const { connectPage, preview } = setup();
    connectPage("kiosk");
    preview.watch("s1");

    expect(preview.fromPage("intruder", "s1", OFFER)).toBe(false);
    expect(preview.fromViewer("unknown", ANSWER)).toBe(false);
  });

  test("a viewer that leaves tells the page and frees its place", async () => {
    const { connectPage, preview } = setup();
    const page = connectPage("kiosk");
    const controller = new AbortController();
    preview.watch("s1", controller.signal);
    await page.next(); // start

    controller.abort();

    expect((await page.next()).signal).toEqual({
      kind: "end",
      reason: "viewer-left",
    });
    expect(preview.countViewers()).toBe(0);
  });

  test("a page that leaves ends its viewer's stream", async () => {
    const { connectPage, preview } = setup();
    const page = connectPage("kiosk");
    const viewer = preview.watch("s1");
    await viewer.next(); // start

    page.controller.abort();

    expect((await viewer.next()).value).toEqual({
      kind: "end",
      reason: "page-left",
    });
    expect((await viewer.next()).done).toBe(true);
    expect(preview.countViewers()).toBe(0);
  });

  test("a page that ends the session ends the viewer's stream", async () => {
    const { connectPage, preview } = setup();
    connectPage("kiosk");
    const viewer = preview.watch("s1");
    await viewer.next(); // start

    preview.fromPage("kiosk", "s1", { kind: "end", reason: "camera-off" });

    expect((await viewer.next()).value).toEqual({
      kind: "end",
      reason: "camera-off",
    });
    expect(preview.countViewers()).toBe(0);
  });

  test("a session stops on its own after its maximum length", async () => {
    const { connectPage, preview } = setup({ maxDurationMs: 10 });
    const page = connectPage("kiosk");
    const viewer = preview.watch("s1");
    await viewer.next(); // start
    await page.next(); // start

    expect((await viewer.next()).value).toEqual({
      kind: "end",
      reason: "timeout",
    });
    expect((await page.next()).signal).toEqual({
      kind: "end",
      reason: "timeout",
    });
  });

  test("watches the newest page with a working camera", async () => {
    const { connectPage, preview } = setup();
    connectPage("old");
    await Bun.sleep(2);
    const newer = connectPage("new");

    preview.watch("s1");

    expect((await newer.next()).pageId).toBe("new");
  });
});
