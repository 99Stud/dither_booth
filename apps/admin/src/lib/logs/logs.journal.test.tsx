import { afterEach, describe, expect, it } from "bun:test";

import type { LogEntry } from "./logs.types";

import { createLogHub } from "./logs.hub";
import { createJournalLogSource, parseJournalLine } from "./logs.journal";
import { createLogsRoute } from "./logs.routes";
import {
  createFakeJournal,
  createTestLogsSocket,
  eventually,
  journalRecord,
} from "./logs.testing";

const cleanups: Array<() => unknown> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

const at = (seconds: number) =>
  new Date(Date.UTC(2026, 9, 27, 12, 0, seconds)).toISOString();

function setUp(journal: ReturnType<typeof createFakeJournal>) {
  const route = createLogsRoute({
    hub: createLogHub({
      batchMs: 10,
      sources: [
        createJournalLogSource({ spawn: journal.spawn, restartDelayMs: 10 }),
      ],
    }),
  });

  return () => {
    const client = createTestLogsSocket();
    let open = true;
    const close = () => {
      if (open) {
        open = false;
        route.close?.(client.socket, 1000, "");
      }
    };
    route.open?.(client.socket);
    cleanups.push(close);

    return {
      ...client,
      close,
      send: (message: unknown) =>
        route.message?.(client.socket, JSON.stringify(message)),
    };
  };
}

const messagesOf = (entries: LogEntry[]) => entries.map((entry) => entry.raw);

const CURSOR =
  "s=7d3f0c2a9b8e4f51a6c2d1e0f9a8b7c6;i=1a2b;b=0f1e2d3c4b5a69788796a5b4c3d2e1f0;m=3b9aca00;t=6420b1c2d3e4f;x=9a8b7c6d5e4f3a2b";

function journalLine(fields: Record<string, unknown>) {
  return JSON.stringify({
    __CURSOR: CURSOR,
    __REALTIME_TIMESTAMP: "1761566400123456",
    __MONOTONIC_TIMESTAMP: "1000000000",
    _BOOT_ID: "0f1e2d3c4b5a69788796a5b4c3d2e1f0",
    ...fields,
  });
}

describe("parseJournalLine", () => {
  it("maps a NetworkManager warning to a system entry", () => {
    const parsed = parseJournalLine(
      journalLine({
        PRIORITY: "4",
        _TRANSPORT: "journal",
        _SYSTEMD_UNIT: "NetworkManager.service",
        SYSLOG_IDENTIFIER: "NetworkManager",
        _PID: "612",
        MESSAGE: "<warn>  device (wlan0): Activation: failed",
      }),
    );

    expect(parsed?.cursor).toBe(CURSOR);
    expect(parsed?.entry).toEqual({
      id: `system:${CURSOR}`,
      timestamp: "2025-10-27T12:00:00.123Z",
      service: "system",
      stream: "journal",
      level: "warn",
      source: "NetworkManager.service",
      details: { identifier: "NetworkManager", pid: 612 },
      raw: "<warn>  device (wlan0): Activation: failed",
      origin: "server",
    });
  });

  it.each([
    ["0", "error"],
    ["3", "error"],
    ["4", "warn"],
    ["5", "info"],
    ["7", "info"],
    [undefined, "info"],
  ] as const)("maps PRIORITY %p to %p", (priority, level) => {
    const parsed = parseJournalLine(
      journalLine({ PRIORITY: priority, MESSAGE: "line" }),
    );

    expect(parsed?.entry.level).toBe(level);
  });

  it("names kernel messages kernel", () => {
    const parsed = parseJournalLine(
      journalLine({
        PRIORITY: "3",
        _TRANSPORT: "kernel",
        SYSLOG_IDENTIFIER: "kernel",
        MESSAGE: "hwmon hwmon1: Undervoltage detected!",
      }),
    );

    expect(parsed?.entry.source).toBe("kernel");
    expect(parsed?.entry.details).toEqual({ identifier: "kernel" });
  });

  it("names systemd's messages about a unit after that unit", () => {
    const parsed = parseJournalLine(
      journalLine({
        PRIORITY: "6",
        _PID: "1",
        _SYSTEMD_UNIT: "init.scope",
        UNIT: "ditherbooth.service",
        SYSLOG_IDENTIFIER: "systemd",
        MESSAGE: "ditherbooth.service: Main process exited, code=exited",
      }),
    );

    expect(parsed?.entry.source).toBe("ditherbooth.service");
  });

  it("decodes byte-array messages and marks over-long ones", () => {
    expect(
      parseJournalLine(journalLine({ MESSAGE: [104, 195, 169, 27, 33] }))?.entry
        .raw,
    ).toBe("hé\u001b!");
    expect(parseJournalLine(journalLine({ MESSAGE: null }))?.entry.raw).toBe(
      "(message too long to show)",
    );
  });

  it("ignores lines that aren't journal records", () => {
    expect(parseJournalLine("-- No entries --")).toBeUndefined();
    expect(parseJournalLine('{"MESSAGE":"no cursor"}')).toBeUndefined();
  });
});

describe("the system journal on the /admin/logs socket", () => {
  it("sends journal history, then new journal lines as they come", async () => {
    const journal = createFakeJournal({
      records: [journalRecord(1, at(1)), journalRecord(2, at(2))],
    });
    const client = setUp(journal)();
    client.send({ type: "history", filter: {}, limit: 10 });

    await eventually(() => expect(client.lastHistory()).toBeDefined());
    expect(messagesOf(client.lastHistory()!.entries)).toEqual([
      "journal line 1",
      "journal line 2",
    ]);
    expect(client.lastHistory()!.done).toBe(true);
    expect(client.lastHistory()!.entries[0]).toMatchObject({
      service: "system",
      stream: "journal",
      source: "NetworkManager.service",
    });

    journal.append(journalRecord(3, at(3)), journalRecord(4, at(4)));

    await eventually(() =>
      expect(messagesOf(client.appended())).toEqual([
        "journal line 3",
        "journal line 4",
      ]),
    );
  });

  it("pages filtered history backward, with no repeats", async () => {
    const journal = createFakeJournal({
      records: Array.from({ length: 9 }, (_, index) =>
        journalRecord(index + 1, at(index + 1), {
          PRIORITY: index % 2 === 0 ? "3" : "6",
        }),
      ),
    });
    const client = setUp(journal)();
    const filter = { levels: ["error"] };
    client.send({ type: "history", filter, limit: 2 });
    await eventually(() => expect(client.histories()).toHaveLength(1));

    while (!client.lastHistory()!.done) {
      const count = client.histories().length;
      client.send({
        type: "history",
        filter,
        limit: 2,
        before: client.lastCursor(),
      });
      await eventually(() =>
        expect(client.histories()).toHaveLength(count + 1),
      );
    }

    expect(
      client
        .histories()
        .toReversed()
        .flatMap((history) => messagesOf(history.entries)),
    ).toEqual([
      "journal line 1",
      "journal line 3",
      "journal line 5",
      "journal line 7",
      "journal line 9",
    ]);
  });

  it("resumes on a new socket with the lines it missed", async () => {
    const journal = createFakeJournal({
      records: [journalRecord(1, at(1))],
    });
    const connect = setUp(journal);
    const first = connect();
    first.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(first.lastHistory()).toBeDefined());
    journal.append(journalRecord(2, at(2)));
    await eventually(() =>
      expect(messagesOf(first.appended())).toEqual(["journal line 2"]),
    );
    const cursor = first.lastCursor();
    first.close();
    await eventually(() => expect(journal.running()).toBe(0));

    journal.append(journalRecord(3, at(3)), journalRecord(4, at(4)));
    const second = connect();
    second.send({ type: "history", filter: {}, limit: 10, after: cursor });
    await eventually(() => expect(second.lastHistory()?.done).toBe(true));
    journal.append(journalRecord(5, at(5)));

    await eventually(() =>
      expect(messagesOf(second.appended())).toEqual(["journal line 5"]),
    );
    expect(messagesOf(second.lastHistory()!.entries)).toEqual([
      "journal line 3",
      "journal line 4",
    ]);
  });

  it("follows the booth's units and the kernel with one journalctl, killed when the last page closes", async () => {
    const journal = createFakeJournal({ records: [journalRecord(1, at(1))] });
    const client = setUp(journal)();
    client.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());

    const matches = [
      "_SYSTEMD_UNIT=ditherbooth.service",
      "_SYSTEMD_UNIT=ditherbooth-network.service",
      "_SYSTEMD_UNIT=NetworkManager.service",
      "+",
      "UNIT=ditherbooth.service",
      "UNIT=ditherbooth-network.service",
      "UNIT=NetworkManager.service",
      "+",
      "_TRANSPORT=kernel",
    ];
    expect(journal.spawned.slice(0, 2)).toEqual([
      ["--output=json", "--no-pager", "--reverse", "--lines=1", ...matches],
      [
        "--output=json",
        "--no-pager",
        "--follow",
        "--lines=all",
        `--after-cursor=${journalRecord(1, at(1)).__CURSOR}`,
        ...matches,
      ],
    ]);
    expect(journal.running()).toBe(1);

    client.close();

    await eventually(() => expect(journal.running()).toBe(0));
  });

  it("restarts journalctl when it exits, without losing lines", async () => {
    const journal = createFakeJournal({ records: [journalRecord(1, at(1))] });
    const client = setUp(journal)();
    client.send({ type: "history", filter: {}, limit: 10 });
    await eventually(() => expect(client.lastHistory()).toBeDefined());

    journal.endFollowers();
    await eventually(() =>
      expect(client.statuses().map((status) => status.state)).toEqual([
        "available",
        "unavailable",
        "available",
      ]),
    );
    journal.append(journalRecord(2, at(2)));

    await eventually(() =>
      expect(messagesOf(client.appended())).toEqual(["journal line 2"]),
    );
  });

  it("is unavailable, not broken, without journalctl", async () => {
    const client = setUp(createFakeJournal({ missing: true }))();
    client.send({ type: "history", filter: {}, limit: 10 });

    await eventually(() => expect(client.lastHistory()).toBeDefined());
    expect(client.lastHistory()).toMatchObject({ entries: [], done: true });
    expect(client.statuses()).toEqual([
      {
        type: "source-status",
        service: "system",
        state: "unavailable",
        message:
          "No journalctl on this machine: system logs are read on the booth.",
      },
    ]);
    expect(client.closes).toEqual([]);
  });

  it("is unavailable when the service user can't read the system journal", async () => {
    const client = setUp(
      createFakeJournal({
        records: [journalRecord(1, at(1))],
        stderr:
          "Hint: You are currently not seeing messages from other users and the system.\n",
      }),
    )();
    client.send({ type: "history", filter: {}, limit: 10 });

    await eventually(() => expect(client.lastHistory()).toBeDefined());
    expect(client.lastHistory()!.entries).toEqual([]);
    expect(client.statuses()[0]?.state).toBe("unavailable");
    expect(client.statuses()[0]?.message).toContain("systemd-journal");
  });
});
