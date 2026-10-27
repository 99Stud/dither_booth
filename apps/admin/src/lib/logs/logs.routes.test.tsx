import { afterEach, describe, expect, it } from "bun:test";

import type { LogEntry, LogSource } from "./logs.types";

import { createLogHub } from "./logs.hub";
import { createPm2LogSources } from "./logs.pm2";
import { createLogsRoute } from "./logs.routes";
import {
  createFakeLogSource,
  createTestLogsSocket,
  TEST_PM2_PROCESS_NAMES,
  createTestPm2LogDir,
  eventually,
  kioskMessage,
  pm2Envelope,
  systemEntry,
} from "./logs.testing";

const cleanups: Array<() => Promise<unknown> | unknown> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function setUp({
  batchMs = 10,
  continuationGraceMs,
  extraSources = [],
}: {
  batchMs?: number;
  continuationGraceMs?: number;
  extraSources?: LogSource[];
} = {}) {
  const logs = await createTestPm2LogDir();
  cleanups.push(logs.cleanup);

  const route = createLogsRoute({
    hub: createLogHub({
      batchMs,
      sources: [
        ...createPm2LogSources({
          logDir: logs.logDir,
          pollIntervalMs: 10,
          continuationGraceMs,
          processNames: TEST_PM2_PROCESS_NAMES,
        }),
        ...extraSources,
      ],
    }),
  });

  const connect = () => {
    const client = createTestLogsSocket();
    route.open?.(client.socket);
    cleanups.push(() => route.close?.(client.socket, 1000, ""));

    return {
      ...client,
      send: (message: unknown) =>
        route.message?.(client.socket, JSON.stringify(message)),
    };
  };

  return { connect, logs, route };
}

// Bun 1.3 empties objects matched with `toMatchObject` + `objectContaining`
// inside arrays, so pages are compared as plain values.
function eventsAndDone(history: { entries: LogEntry[]; done: boolean }) {
  return {
    events: history.entries.map((entry) => entry.event ?? entry.id),
    done: history.done,
  };
}

const at = (seconds: number) =>
  new Date(Date.UTC(2026, 9, 27, 12, 0, seconds)).toISOString();

function engineEvent(
  seconds: number,
  event: string,
  level: "error" | "info" | "warn" = "info",
) {
  return pm2Envelope({
    service: "engine",
    timestamp: at(seconds),
    type: level === "info" ? "out" : "err",
    message: kioskMessage({
      loggedAt: at(seconds),
      level,
      source: "engine.printer",
      event,
      details: { seconds },
    }),
  });
}

/**
 * One engine event that PM2 wrote as two envelopes, cut mid-JSON. Written
 * `writtenAt` (default: long ago, so no live read waits for its rest).
 */
function splitEngineEvent(
  seconds: number,
  event: string,
  writtenAt = at(seconds),
) {
  const message = kioskMessage({
    loggedAt: at(seconds),
    level: "info",
    source: "engine.printer",
    event,
    details: { seconds, padding: "x".repeat(200) },
  });
  const cut = Math.floor(message.length / 2);

  return [
    pm2Envelope({
      service: "engine",
      timestamp: writtenAt,
      message: message.slice(0, cut),
    }),
    pm2Envelope({
      service: "engine",
      timestamp: writtenAt,
      message: message.slice(cut),
    }),
  ] as const;
}

function shutterEvent(seconds: number, event: string) {
  return pm2Envelope({
    service: "shutter",
    timestamp: at(seconds),
    message: kioskMessage({
      loggedAt: at(seconds),
      level: "info",
      source: "shutter.server",
      event,
    }),
  });
}

describe("the /admin/logs socket", () => {
  it("sends the latest history page from every service, in time order", async () => {
    const { connect, logs } = await setUp();
    await logs.write("engine", engineEvent(1, "e1"), engineEvent(3, "e3"));
    await logs.write("shutter", shutterEvent(2, "s2"), shutterEvent(4, "s4"));

    const client = connect();
    client.send({ type: "history", filter: {}, limit: 10 });

    await eventually(() => expect(client.lastHistory()).toBeDefined());
    const history = client.lastHistory()!;

    expect(history.entries.map((entry) => entry.event)).toEqual([
      "e1",
      "s2",
      "e3",
      "s4",
    ]);
    expect(history.done).toBe(true);
    expect(history.entries[0]).toMatchObject({
      timestamp: at(1),
      service: "engine",
      stream: "out",
      level: "info",
      source: "engine.printer",
      event: "e1",
      details: { seconds: 1 },
      origin: "server",
    });
  });

  it("pages backward through history until done, with no repeats", async () => {
    const { connect, logs } = await setUp();
    await logs.write(
      "engine",
      ...Array.from({ length: 5 }, (_, index) =>
        engineEvent(index * 2, `e${index * 2}`),
      ),
    );
    await logs.write(
      "shutter",
      ...Array.from({ length: 5 }, (_, index) =>
        shutterEvent(index * 2 + 1, `s${index * 2 + 1}`),
      ),
    );

    const client = connect();
    const events: string[] = [];
    client.send({ type: "history", filter: {}, limit: 4 });

    for (let page = 1; ; page += 1) {
      await eventually(() => expect(client.histories()).toHaveLength(page));
      const history = client.lastHistory()!;
      events.unshift(...history.entries.map((entry) => entry.event!));

      if (history.done) {
        break;
      }

      client.send({
        type: "history",
        filter: {},
        limit: 4,
        before: history.cursor,
      });
    }

    expect(events).toEqual([
      "e0",
      "s1",
      "e2",
      "s3",
      "e4",
      "s5",
      "e6",
      "s7",
      "e8",
      "s9",
    ]);
    expect(client.histories()).toHaveLength(3);
  });

  it("pages through files far larger than one read chunk", async () => {
    const { connect, logs } = await setUp();
    const count = 3000;
    await logs.write(
      "engine",
      ...Array.from({ length: count }, (_, index) =>
        engineEvent(index, `e${index}`),
      ),
    );

    const client = connect();
    const events: string[] = [];
    client.send({ type: "history", filter: {}, limit: 700 });

    for (let page = 1; ; page += 1) {
      await eventually(() => expect(client.histories()).toHaveLength(page));
      const history = client.lastHistory()!;
      events.unshift(...history.entries.map((entry) => entry.event!));

      if (history.done) {
        break;
      }

      client.send({
        type: "history",
        filter: {},
        limit: 700,
        before: history.cursor,
      });
    }

    expect(events).toEqual(
      Array.from({ length: count }, (_, index) => `e${index}`),
    );
  });

  it("filters history on the booth, paging past lines that don't match", async () => {
    const { connect, logs } = await setUp();
    await logs.write(
      "engine",
      engineEvent(1, "old-error", "error"),
      ...Array.from({ length: 50 }, (_, index) =>
        engineEvent(2 + index, `noise${index}`),
      ),
      engineEvent(60, "new-warn", "warn"),
      engineEvent(61, "noise-end"),
    );
    await logs.write("shutter", shutterEvent(30, "shutter-info"));

    const client = connect();
    const filter = { levels: ["error", "warn"], services: ["engine"] };
    client.send({ type: "history", filter, limit: 1 });
    await eventually(() => expect(client.histories()).toHaveLength(1));
    expect(client.lastHistory()!.entries.map((entry) => entry.event)).toEqual([
      "new-warn",
    ]);
    expect(client.lastHistory()!.done).toBe(false);

    client.send({
      type: "history",
      filter,
      limit: 1,
      before: client.lastHistory()!.cursor,
    });
    await eventually(() => expect(client.histories()).toHaveLength(2));
    expect(client.lastHistory()!.entries.map((entry) => entry.event)).toEqual([
      "old-error",
    ]);
    expect(client.lastHistory()!.done).toBe(true);
  });

  it("turns plain-text and multi-line chunks into entries", async () => {
    const { connect, logs } = await setUp();
    await logs.write(
      "engine",
      pm2Envelope({
        service: "engine",
        timestamp: at(1),
        type: "err",
        message: "TypeError: boom\n    at run (server.js:1:1)\n",
      }),
      pm2Envelope({
        service: "engine",
        timestamp: at(2),
        message: `${kioskMessage({
          loggedAt: at(2),
          level: "warn",
          source: "engine.printer",
          event: "paper-low",
        })}bun: listening\n\n`,
      }),
      pm2Envelope({ service: "engine", timestamp: at(3), message: "partial" }),
    );

    const client = connect();
    client.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());

    expect(
      client.lastHistory()!.entries.map(({ event, level, raw, stream }) => ({
        event,
        level,
        raw,
        stream,
      })),
    ).toEqual([
      {
        event: undefined,
        level: "error",
        raw: "TypeError: boom",
        stream: "err",
      },
      {
        event: undefined,
        level: "error",
        raw: "    at run (server.js:1:1)",
        stream: "err",
      },
      {
        event: "paper-low",
        level: "warn",
        raw: expect.stringMatching(/^\[kiosk\] \{/),
        stream: "out",
      },
      { event: undefined, level: "info", raw: "bun: listening", stream: "out" },
      { event: undefined, level: "info", raw: "partial", stream: "out" },
    ]);
    const ids = client.lastHistory()!.entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("re-joins an event PM2 split across two chunks, in history pages both ways", async () => {
    const { connect, logs } = await setUp();
    const [first, second] = splitEngineEvent(2, "big");
    await logs.write(
      "engine",
      engineEvent(1, "e1"),
      first,
      second,
      engineEvent(3, "e3"),
    );

    const client = connect();
    client.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());
    const big = client.lastHistory()!.entries[1];

    expect(eventsAndDone(client.lastHistory()!)).toEqual({
      events: ["e1", "big", "e3"],
      done: true,
    });
    expect(big).toMatchObject({ level: "info", details: { seconds: 2 } });

    // One line per page, backward: the split event is still one entry.
    const events: string[] = [];
    client.send({ type: "history", filter: {}, limit: 1 });

    for (let page = 2; ; page += 1) {
      await eventually(() => expect(client.histories()).toHaveLength(page));
      const history = client.lastHistory()!;
      events.unshift(...history.entries.map((entry) => entry.event ?? "?"));

      if (history.done) {
        break;
      }

      client.send({
        type: "history",
        filter: {},
        limit: 1,
        before: history.cursor,
      });
    }

    expect(events).toEqual(["e1", "big", "e3"]);
  });

  it("re-joins a split event when resuming over it", async () => {
    const { connect, logs, route } = await setUp();
    const [first, second] = splitEngineEvent(2, "big");
    await logs.write("engine", engineEvent(1, "e1"));

    const away = connect();
    away.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(away.lastHistory()).toBeDefined());
    const cursor = away.lastCursor()!;
    await route.close?.(away.socket, 1000, "");

    await logs.append("engine", first, second, engineEvent(3, "e3"));

    const resumed = connect();
    resumed.send({ type: "history", filter: {}, limit: 10, after: cursor });
    await eventually(() => expect(resumed.lastHistory()?.done).toBe(true));
    expect(eventsAndDone(resumed.lastHistory()!).events).toEqual(["big", "e3"]);
  });

  it("re-joins a split event as it is written live, even across start", async () => {
    const { connect, logs } = await setUp({ continuationGraceMs: 2000 });
    const now = new Date().toISOString();
    const [firstA, secondA] = splitEngineEvent(1, "split-at-start", now);
    const [firstB, secondB] = splitEngineEvent(2, "split-live", now);
    await logs.write("engine", engineEvent(0, "e0"), firstA);

    const client = connect();
    client.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());
    expect(eventsAndDone(client.lastHistory()!).events).toEqual(["e0"]);

    await logs.append("engine", secondA);
    await logs.append("engine", firstB);
    await Bun.sleep(50);
    await logs.append("engine", secondB);

    await eventually(() =>
      expect(client.appended().map((entry) => entry.event)).toEqual([
        "split-at-start",
        "split-live",
      ]),
    );
  });

  it("sends a cut line on its own once nothing continues it", async () => {
    const { connect, logs } = await setUp({ continuationGraceMs: 100 });
    await logs.write("engine");

    const client = connect();
    client.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());

    await logs.append(
      "engine",
      pm2Envelope({
        service: "engine",
        timestamp: new Date().toISOString(),
        message: "prompt> ",
      }),
    );
    await Bun.sleep(50);
    expect(client.appended()).toEqual([]);

    await eventually(() =>
      expect(client.appended().map((entry) => entry.raw)).toEqual(["prompt> "]),
    );
  });

  it("keeps browser lines' origin and device", async () => {
    const { connect, logs } = await setUp();
    await logs.write(
      "shutter",
      pm2Envelope({
        service: "shutter",
        timestamp: at(1),
        type: "err",
        message: kioskMessage({
          loggedAt: at(1),
          level: "error",
          source: "shutter.capture",
          event: "camera-failed",
          error: { message: "NotAllowedError", stack: "at capture" },
          origin: "browser",
          deviceId: "ipad-1",
          runId: 3,
        }),
      }),
    );

    const client = connect();
    client.send({
      type: "history",
      filter: { services: ["browser"] },
      limit: 10,
    });
    await eventually(() => expect(client.lastHistory()).toBeDefined());

    expect(client.lastHistory()!.entries).toEqual([
      expect.objectContaining({
        service: "shutter",
        origin: "browser",
        deviceId: "ipad-1",
        runId: 3,
        error: { message: "NotAllowedError", stack: "at capture" },
      }),
    ]);
  });

  it("streams new lines from every source in one batch, in time order", async () => {
    const system = createFakeLogSource({ service: "system" });
    const { connect, logs } = await setUp({
      batchMs: 150,
      extraSources: [system.source],
    });
    await logs.write("engine", engineEvent(0, "before-connect"));
    await logs.write("shutter");

    const client = connect();
    client.send({ type: "history", filter: { levels: ["error"] }, limit: 10 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());

    await logs.append("engine", engineEvent(5, "e5"));
    await logs.append("shutter", shutterEvent(4, "s4"));
    system.push(systemEntry("j3", at(3)));

    await eventually(() => expect(client.appended()).toHaveLength(3));
    expect(client.appended().map((entry) => entry.event ?? entry.id)).toEqual([
      "j3",
      "s4",
      "e5",
    ]);
    expect(
      client.messages.filter(
        (message) => message.type === "append" && message.entries.length > 0,
      ),
    ).toHaveLength(1);
  });

  it("merges a plugged-in source into history", async () => {
    const system = createFakeLogSource({
      service: "system",
      entries: [systemEntry("j2", at(2)), systemEntry("j4", at(4))],
    });
    const { connect, logs } = await setUp({ extraSources: [system.source] });
    await logs.write("engine", engineEvent(1, "e1"), engineEvent(3, "e3"));

    const client = connect();
    client.send({ type: "history", filter: {}, limit: 3 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());
    expect(
      client.lastHistory()!.entries.map((entry) => entry.event ?? entry.id),
    ).toEqual(["j2", "e3", "j4"]);

    client.send({
      type: "history",
      filter: {},
      limit: 3,
      before: client.lastHistory()!.cursor,
    });
    await eventually(() => expect(client.histories()).toHaveLength(2));
    expect(eventsAndDone(client.lastHistory()!)).toEqual({
      events: ["e1"],
      done: true,
    });
  });

  it("reports a truncated file as rotated and follows it from the start", async () => {
    const { connect, logs } = await setUp();
    await logs.write("engine", engineEvent(1, "e1"), engineEvent(2, "e2"));

    const client = connect();
    client.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());
    await logs.append("engine", engineEvent(3, "e3"));
    await eventually(() => expect(client.appended()).toHaveLength(1));

    await logs.write("engine");
    await eventually(() =>
      expect(client.statuses().map((status) => status.state)).toContain(
        "rotated",
      ),
    );
    await logs.append("engine", engineEvent(4, "after-rotation"));

    await eventually(() =>
      expect(client.appended().map((entry) => entry.event)).toEqual([
        "e3",
        "after-rotation",
      ]),
    );
    expect(
      client.statuses().filter((status) => status.state === "rotated"),
    ).toEqual([
      {
        type: "source-status",
        service: "engine",
        state: "rotated",
        message: expect.stringContaining("dither-booth-engine.log"),
      },
    ]);
  });

  it("spots a rotation even when the new file has outgrown the old position", async () => {
    const { connect, logs } = await setUp({ batchMs: 10 });
    await logs.write("engine", engineEvent(1, "e1"));

    const client = connect();
    client.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());

    // Truncate and refill in one write: the file never looks smaller.
    await logs.write(
      "engine",
      engineEvent(5, "n1"),
      engineEvent(6, "n2"),
      engineEvent(7, "n3"),
    );

    await eventually(() =>
      expect(client.appended().map((entry) => entry.event)).toEqual([
        "n1",
        "n2",
        "n3",
      ]),
    );
    expect(client.statuses().map((status) => status.state)).toContain(
      "rotated",
    );
  });

  it("resumes on a new socket after the last cursor, with no repeats or gaps", async () => {
    const { connect, logs, route } = await setUp();
    await logs.write("engine", engineEvent(1, "e1"));
    await logs.write("shutter");

    const first = connect();
    first.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(first.lastHistory()).toBeDefined());
    await logs.append("engine", engineEvent(2, "e2"));
    await eventually(() => expect(first.appended()).toHaveLength(1));
    const cursor = first.lastCursor()!;
    await route.close?.(first.socket, 1006, "");

    // Written while the page was offline.
    await logs.append("engine", engineEvent(3, "e3"), engineEvent(4, "e4"));
    await logs.append("shutter", shutterEvent(5, "s5"));

    const second = connect();
    second.send({ type: "history", filter: {}, limit: 2, after: cursor });
    await eventually(() => expect(second.histories()).toHaveLength(1));
    expect(second.lastHistory()!.entries.map((entry) => entry.event)).toEqual([
      "e3",
      "e4",
    ]);
    expect(second.lastHistory()!.done).toBe(false);

    // Live lines wait until the page has caught up.
    await logs.append("engine", engineEvent(6, "e6"));
    await Bun.sleep(80);
    expect(second.appended()).toEqual([]);

    second.send({
      type: "history",
      filter: {},
      limit: 2,
      after: second.lastCursor(),
    });
    await eventually(() => expect(second.appended()).toHaveLength(1));
    expect(eventsAndDone(second.lastHistory()!)).toEqual({
      events: ["s5"],
      done: true,
    });

    const seen = [
      ...second.lastHistory()!.entries,
      ...second.histories()[0]!.entries,
      ...second.appended(),
    ].map((entry) => entry.event);
    expect(seen.toSorted()).toEqual(["e3", "e4", "e6", "s5"]);
    // The held live line comes after the page that caught up.
    expect(second.messages.at(-1)?.type).toBe("append");
  });

  it("resumes from the first page's cursor when no line arrived live", async () => {
    const { connect, logs, route } = await setUp();
    await logs.write("engine", engineEvent(0, "e0"), engineEvent(1, "e1"));

    const first = connect();
    first.send({ type: "history", filter: {}, limit: 1 });
    await eventually(() => expect(first.lastHistory()).toBeDefined());
    expect(first.lastHistory()!.entries.map((entry) => entry.event)).toEqual([
      "e1",
    ]);
    const cursor = first.lastCursor()!;
    await route.close?.(first.socket, 1006, "");

    await logs.append("engine", engineEvent(2, "e2"));

    const second = connect();
    second.send({ type: "history", filter: {}, limit: 10, after: cursor });
    await eventually(() => expect(second.lastHistory()).toBeDefined());
    expect(eventsAndDone(second.lastHistory()!)).toEqual({
      events: ["e2"],
      done: true,
    });

    // The resumed cursor still pages older history.
    second.send({
      type: "history",
      filter: {},
      limit: 10,
      before: second.lastCursor(),
    });
    await eventually(() => expect(second.histories()).toHaveLength(2));
    expect(second.lastHistory()!.entries.map((entry) => entry.event)).toEqual([
      "e0",
    ]);
  });

  it("reports missing files and a missing journal as unavailable", async () => {
    const system = createFakeLogSource({
      service: "system",
      status: { state: "unavailable", message: "System logs unavailable." },
    });
    const { connect, logs } = await setUp({ extraSources: [system.source] });
    await logs.write("engine", engineEvent(1, "e1"));

    const client = connect();
    client.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());

    expect(
      client.statuses().map(({ service, state }) => ({ service, state })),
    ).toEqual([
      { service: "engine", state: "available" },
      { service: "shutter", state: "unavailable" },
      { service: "admin", state: "unavailable" },
      { service: "system", state: "unavailable" },
    ]);
    expect(client.statuses()[1]!.message).toContain("dither-booth-shutter.log");
    expect(eventsAndDone(client.lastHistory()!)).toEqual({
      events: ["e1"],
      done: true,
    });
  });

  it("picks up a log file that appears later", async () => {
    const { connect, logs } = await setUp();

    const client = connect();
    client.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());

    await logs.write(
      "admin",
      pm2Envelope({ service: "admin", timestamp: at(1), message: "hello\n" }),
    );

    await eventually(() =>
      expect(client.appended().map((entry) => entry.raw)).toEqual(["hello"]),
    );
    expect(
      client
        .statuses()
        .filter((status) => status.service === "admin")
        .map((status) => status.state),
    ).toEqual(["unavailable", "available"]);
  });

  it.each([
    ["not JSON", "{nope"],
    [
      "an unknown type",
      JSON.stringify({ type: "tail", filter: {}, limit: 10 }),
    ],
    [
      "a limit over the maximum",
      JSON.stringify({ type: "history", filter: {}, limit: 5000 }),
    ],
    [
      "an unknown level",
      JSON.stringify({
        type: "history",
        filter: { levels: ["debug"] },
        limit: 10,
      }),
    ],
    [
      "both cursors",
      JSON.stringify({
        type: "history",
        filter: {},
        limit: 10,
        before: "a",
        after: "b",
      }),
    ],
    [
      "a cursor that isn't one",
      JSON.stringify({
        type: "history",
        filter: {},
        limit: 10,
        before: "garbage",
      }),
    ],
  ])("rejects %s", async (_label, message) => {
    const { route } = await setUp();
    const client = createTestLogsSocket();
    route.open?.(client.socket);
    cleanups.push(() => route.close?.(client.socket, 1008, ""));

    route.message?.(client.socket, message);

    await eventually(() => expect(client.closes).toHaveLength(1));
    expect(client.closes[0]!.code).toBe(1008);
    expect(client.messages.map((sent) => sent.type)).not.toContain("history");
    expect(client.messages.at(-1)?.type).toBe("error");
  });

  it("rejects a well-formed cursor with positions a source can't read", async () => {
    const { connect, logs } = await setUp();
    await logs.write("engine", engineEvent(1, "e1"));
    const client = connect();
    const cursor = Buffer.from(
      JSON.stringify({ b: { engine: "not-a-position" }, a: {} }),
    ).toString("base64url");

    client.send({ type: "history", filter: {}, limit: 10, before: cursor });

    await eventually(() => expect(client.closes).toHaveLength(1));
    expect(client.closes[0]!.code).toBe(1008);
  });

  it("keeps lines a source sends while another source is still starting", async () => {
    const engine = createFakeLogSource({
      service: "engine",
      entries: [systemEntry("old", at(0), { service: "engine" })],
    });
    const system = createFakeLogSource({ service: "system" });
    let releaseSystem!: () => void;
    const systemStarted = new Promise<void>((resolve) => {
      releaseSystem = resolve;
    });
    let engineStarted = false;
    const route = createLogsRoute({
      hub: createLogHub({
        batchMs: 10,
        sources: [
          {
            ...engine.source,
            start: async (listener) => {
              await engine.source.start(listener);
              engine.push(systemEntry("during", at(1), { service: "engine" }));
              engineStarted = true;
            },
          },
          {
            ...system.source,
            start: async (listener) => {
              await systemStarted;
              await system.source.start(listener);
            },
          },
        ],
      }),
    });
    const client = createTestLogsSocket();
    route.open?.(client.socket);
    cleanups.push(() => route.close?.(client.socket, 1000, ""));

    route.message?.(
      client.socket,
      JSON.stringify({ type: "history", filter: {}, limit: 10 }),
    );
    await eventually(() => expect(engineStarted).toBe(true));
    engine.push(systemEntry("after", at(2), { service: "engine" }));
    releaseSystem();

    await eventually(() => expect(client.lastHistory()).toBeDefined());
    await eventually(() =>
      expect(
        [...client.lastHistory()!.entries, ...client.appended()].map(
          (entry) => entry.id,
        ),
      ).toEqual(["old", "during", "after"]),
    );
  });

  it("starts each source with the first page and stops it with the last", async () => {
    const system = createFakeLogSource({ service: "system" });
    const { connect, route } = await setUp({ extraSources: [system.source] });

    const first = connect();
    const second = connect();
    expect(system.lifecycle).toEqual({ starts: 0, stops: 0 });

    first.send({ type: "history", filter: {}, limit: 10 });
    second.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(second.lastHistory()).toBeDefined());
    await eventually(() => expect(first.lastHistory()).toBeDefined());
    expect(system.lifecycle).toEqual({ starts: 1, stops: 0 });

    system.push(systemEntry("j1", at(1)));
    await eventually(() => expect(first.appended()).toHaveLength(1));
    await eventually(() => expect(second.appended()).toHaveLength(1));

    await route.close?.(first.socket, 1000, "");
    await Bun.sleep(20);
    expect(system.lifecycle).toEqual({ starts: 1, stops: 0 });

    await route.close?.(second.socket, 1000, "");
    await eventually(() =>
      expect(system.lifecycle).toEqual({ starts: 1, stops: 1 }),
    );

    const third = connect();
    third.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(third.lastHistory()).toBeDefined());
    expect(system.lifecycle).toEqual({ starts: 2, stops: 1 });
  });
});
