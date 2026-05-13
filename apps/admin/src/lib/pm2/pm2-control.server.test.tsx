import { describe, expect, it, mock } from "bun:test";
import { resolve } from "node:path";

import type { Pm2Client, Pm2RestartProgressEvent } from "./pm2-control.types";

const adminAppRoot = resolve(import.meta.dir, "../../..");
const repoRoot = resolve(adminAppRoot, "../..");
const processNames = {
  api: "dither-booth-api",
  web: "dither-booth-web",
};

mock.module("#lib/server-constants", () => ({
  ADMIN_APP_ROOT: adminAppRoot,
  ADMIN_REPO_ROOT: repoRoot,
  ADMIN_SERVER_HEALTHZ_SERVICE: "admin",
}));

const {
  Pm2RestartOperationError,
  Pm2RestartTimeoutError,
  getPm2RestartProcessStatus,
  parsePm2RestartProcessNames,
  restartPm2Service,
} = await import("./pm2-control.server");

type TestPm2Client = {
  connect: (callback: (error?: Error) => void) => void;
  describe: (
    processName: string | number,
    callback: (
      error?: Error,
      descriptions?: Array<{
        pid?: number;
        pm2_env?: {
          restart_time?: number;
          status?: string;
        };
      }>,
    ) => void,
  ) => void;
  disconnect: () => void;
  restart: (
    processName: string | number,
    callback: (error?: Error) => void,
  ) => void;
};

function createPm2Client({
  connectError,
  connectHangs,
  describeError,
  describeHangs,
  describeResult = [
    {
      pid: 1234,
      pm2_env: {
        restart_time: 3,
        status: "online",
      },
    },
  ],
  disconnectError,
  restartHangs,
  restartError,
}: {
  connectError?: Error;
  connectHangs?: boolean;
  describeError?: Error;
  describeHangs?: boolean;
  describeResult?: Array<{
    pid?: number;
    pm2_env?: {
      restart_time?: number;
      status?: string;
    };
  }>;
  disconnectError?: Error;
  restartHangs?: boolean;
  restartError?: Error;
} = {}) {
  const events: string[] = [];
  let restartCallback: ((error?: Error) => void) | undefined;
  const client: TestPm2Client = {
    connect: (callback) => {
      events.push("connect");

      if (connectHangs) {
        return;
      }

      callback(connectError);
    },
    describe: (processName, callback) => {
      events.push(`describe:${processName}`);

      if (describeHangs) {
        return;
      }

      callback(describeError, describeResult);
    },
    disconnect: () => {
      events.push("disconnect");

      if (disconnectError) {
        throw disconnectError;
      }
    },
    restart: (processName, callback) => {
      events.push(`restart:${processName}`);

      if (restartHangs) {
        restartCallback = callback;
        return;
      }

      callback(restartError);
    },
  };

  return {
    client: client as unknown as Pm2Client,
    events,
    finishRestart: (error?: Error) => {
      restartCallback?.(error);
    },
  };
}

describe("parsePm2RestartProcessNames", () => {
  it("trims valid restart process names", () => {
    expect(
      parsePm2RestartProcessNames({
        admin: "dither-booth-admin",
        api: " dither-booth-api ",
        web: " dither-booth-web ",
      }),
    ).toEqual({
      api: "dither-booth-api",
      web: "dither-booth-web",
    });
  });

  for (const [name, processNames] of [
    ["missing names", undefined],
    ["missing api", { web: "dither-booth-web" }],
    ["missing web", { api: "dither-booth-api" }],
    ["non-string api", { api: 1234, web: "dither-booth-web" }],
    ["empty web", { api: "dither-booth-api", web: " " }],
  ] as const) {
    it(`rejects ${name}`, () => {
      const error = (() => {
        try {
          parsePm2RestartProcessNames(processNames);
        } catch (error) {
          return error;
        }
      })();

      expect(error).toBeInstanceOf(Pm2RestartOperationError);
      expect((error as InstanceType<typeof Pm2RestartOperationError>).code).toBe(
        "pm2-status-unknown",
      );
      expect((error as Error).message).toBe(
        "Invalid PM2 process name configuration.",
      );
    });
  }
});

describe("restartPm2Service", () => {
  it("connects, restarts, and disconnects", async () => {
    const { client, events } = createPm2Client();
    const progressEvents: Pm2RestartProgressEvent[] = [];

    const result = await restartPm2Service({
      client,
      onProgress: (event) => {
        progressEvents.push(event);
      },
      service: "web",
    });

    expect(result.ok).toBe(true);
    expect(result.processName).toBe(processNames.web);
    expect(result.service).toBe("web");
    expect(Number.isNaN(Date.parse(result.restartedAt))).toBe(false);
    expect(events).toEqual([
      "connect",
      `restart:${processNames.web}`,
      "disconnect",
    ]);
    expect(progressEvents.map((event) => event.type)).toEqual([
      "resolving-process",
      "connecting",
      "restarting",
      "disconnecting",
    ]);
  });

  it("does not disconnect when connect fails", async () => {
    const { client, events } = createPm2Client({
      connectError: new Error("connect failed"),
    });
    const progressEvents: Pm2RestartProgressEvent[] = [];

    await expect(
      restartPm2Service({
        client,
        onProgress: (event) => {
          progressEvents.push(event);
        },
        service: "api",
      }),
    ).rejects.toThrow("connect failed");

    expect(events).toEqual(["connect"]);
    expect(progressEvents.map((event) => event.type)).toEqual([
      "resolving-process",
      "connecting",
    ]);
  });

  it("times out when PM2 connect never responds", async () => {
    const { client, events } = createPm2Client({
      connectHangs: true,
    });

    const error = await restartPm2Service({
      client,
      connectTimeoutMs: 1,
      service: "api",
    }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(Pm2RestartOperationError);
    expect((error as InstanceType<typeof Pm2RestartOperationError>).code).toBe(
      "pm2-connect-timeout",
    );
    expect((error as Error).message).toBe("Timed out connecting to PM2.");
    expect(events).toEqual(["connect"]);
  });

  it("disconnects when restart fails", async () => {
    const { client, events } = createPm2Client({
      restartError: new Error("restart failed"),
    });
    const progressEvents: Pm2RestartProgressEvent[] = [];

    await expect(
      restartPm2Service({
        client,
        onProgress: (event) => {
          progressEvents.push(event);
        },
        service: "api",
      }),
    ).rejects.toThrow("restart failed");

    expect(events).toEqual([
      "connect",
      `restart:${processNames.api}`,
      "disconnect",
    ]);
    expect(progressEvents.map((event) => event.type)).toEqual([
      "resolving-process",
      "connecting",
      "restarting",
      "disconnecting",
    ]);
  });

  it("times out and disconnects when PM2 restart never responds", async () => {
    const { client, events } = createPm2Client({
      restartHangs: true,
    });

    await expect(
      restartPm2Service({
        client,
        restartTimeoutMs: 1,
        service: "web",
      }),
    ).rejects.toThrow(`Timed out restarting ${processNames.web}.`);

    expect(events).toEqual([
      "connect",
      `restart:${processNames.web}`,
      "disconnect",
    ]);
  });

  it("exposes completion when a timed out PM2 restart later responds", async () => {
    const { client, events, finishRestart } = createPm2Client({
      restartHangs: true,
    });

    const error = await restartPm2Service({
      client,
      restartTimeoutMs: 1,
      service: "web",
    }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(Pm2RestartTimeoutError);
    expect(events).toEqual([
      "connect",
      `restart:${processNames.web}`,
      "disconnect",
    ]);

    const completion = (error as InstanceType<typeof Pm2RestartTimeoutError>)
      .completion;
    expect((error as InstanceType<typeof Pm2RestartTimeoutError>).code).toBe(
      "pm2-restart-timeout",
    );
    expect((error as InstanceType<typeof Pm2RestartTimeoutError>).service).toBe(
      "web",
    );
    expect((error as InstanceType<typeof Pm2RestartTimeoutError>).phase).toBe(
      "restart",
    );

    finishRestart();

    await expect(completion).resolves.toBeUndefined();
  });

  it("logs disconnect failures after successful restarts", async () => {
    const { client, events } = createPm2Client({
      disconnectError: new Error("disconnect failed"),
    });
    const progressEvents: Pm2RestartProgressEvent[] = [];

    const result = await restartPm2Service({
      client,
      onProgress: (event) => {
        progressEvents.push(event);
      },
      service: "web",
    });

    expect(result.ok).toBe(true);
    expect(events).toEqual([
      "connect",
      `restart:${processNames.web}`,
      "disconnect",
    ]);
    expect(progressEvents.map((event) => event.type)).toEqual([
      "resolving-process",
      "connecting",
      "restarting",
      "disconnecting",
    ]);
  });
});

describe("getPm2RestartProcessStatus", () => {
  it("returns online process state", async () => {
    const { client, events } = createPm2Client();

    const status = await getPm2RestartProcessStatus({
      client,
      processName: processNames.web,
    });

    expect(status).toEqual({
      exists: true,
      pid: 1234,
      processName: processNames.web,
      restartTime: 3,
      status: "online",
    });
    expect(events).toEqual([
      "connect",
      `describe:${processNames.web}`,
      "disconnect",
    ]);
  });

  it("returns stopped process state", async () => {
    const { client } = createPm2Client({
      describeResult: [
        {
          pid: 0,
          pm2_env: {
            restart_time: 1,
            status: "stopped",
          },
        },
      ],
    });

    const status = await getPm2RestartProcessStatus({
      client,
      processName: processNames.api,
    });

    expect(status).toMatchObject({
      exists: true,
      processName: processNames.api,
      status: "stopped",
    });
  });

  it("returns missing process state", async () => {
    const { client } = createPm2Client({
      describeResult: [],
    });

    const status = await getPm2RestartProcessStatus({
      client,
      processName: "missing-process",
    });

    expect(status).toEqual({
      exists: false,
      pid: undefined,
      processName: "missing-process",
      restartTime: undefined,
      status: undefined,
    });
  });

  it("times out when PM2 describe never responds", async () => {
    const { client, events } = createPm2Client({
      describeHangs: true,
    });

    const error = await getPm2RestartProcessStatus({
      client,
      processName: processNames.web,
      timeoutMs: 1,
    }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(Pm2RestartOperationError);
    expect((error as InstanceType<typeof Pm2RestartOperationError>).code).toBe(
      "pm2-status-unknown",
    );
    expect(events).toEqual([
      "connect",
      `describe:${processNames.web}`,
      "disconnect",
    ]);
  });
});
