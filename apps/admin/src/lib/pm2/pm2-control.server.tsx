import { ADMIN_PM2_CONTROL_LOG_SOURCE } from "#lib/constants";
import { ADMIN_REPO_ROOT } from "#lib/server-constants";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pm2 from "pm2";

import type {
  Pm2Client,
  Pm2RestartFailureCode,
  Pm2RestartPhase,
  Pm2RestartProcessStatus,
  Pm2RestartProgressReporter,
  Pm2RestartProcessNames,
  Pm2RestartResult,
  Pm2RestartService,
} from "./pm2-control.types";

import {
  PM2_RESTART_CONNECT_TIMEOUT_MS,
  PM2_RESTART_PROCESS_TIMEOUT_MS,
  PM2_RESTART_STATUS_TIMEOUT_MS,
  pm2RestartProcessNamesSchema,
} from "./pm2-control.constants";

const pm2Client = pm2;
let pm2RestartProcessNamesPromise: Promise<Pm2RestartProcessNames> | undefined;

type Pm2ProcessDescription = {
  pid?: number;
  pm2_env?: {
    restart_time?: number;
    status?: string;
  };
};

type Pm2DescribeClient = Pm2Client & {
  describe: (
    processName: string | number,
    callback: (error?: Error, descriptions?: Pm2ProcessDescription[]) => void,
  ) => void;
};

export class Pm2RestartOperationError extends Error {
  code: Pm2RestartFailureCode;
  phase: Pm2RestartPhase;
  processName?: string;
  publicMessage: string;
  service?: Pm2RestartService;

  constructor({
    cause,
    code,
    message,
    phase,
    processName,
    publicMessage,
    service,
  }: {
    cause?: unknown;
    code: Pm2RestartFailureCode;
    message: string;
    phase: Pm2RestartPhase;
    processName?: string;
    publicMessage: string;
    service?: Pm2RestartService;
  }) {
    super(message, { cause });
    this.name = "Pm2RestartOperationError";
    this.code = code;
    this.phase = phase;
    this.processName = processName;
    this.publicMessage = publicMessage;
    this.service = service;
  }
}

export class Pm2RestartTimeoutError extends Pm2RestartOperationError {
  completion: Promise<void>;
  override processName: string;
  override service: Pm2RestartService;

  constructor({
    completion,
    message,
    processName,
    service,
  }: {
    completion: Promise<void>;
    message: string;
    processName: string;
    service: Pm2RestartService;
  }) {
    super({
      code: "pm2-restart-timeout",
      message,
      phase: "restart",
      processName,
      publicMessage: message,
      service,
    });
    this.name = "Pm2RestartTimeoutError";
    this.completion = completion;
    this.processName = processName;
    this.service = service;
  }
}

export function parsePm2RestartProcessNames(
  processNames: unknown,
): Pm2RestartProcessNames {
  const parsed = pm2RestartProcessNamesSchema.safeParse(processNames);

  if (parsed.success) {
    return parsed.data;
  }

  throw new Pm2RestartOperationError({
    cause: parsed.error,
    code: "pm2-status-unknown",
    message: "Invalid PM2 process name configuration.",
    phase: "status",
    publicMessage:
      "PM2 process configuration invalid. Check PM2 process names before retrying.",
  });
}

async function getPm2RestartProcessNames(): Promise<Pm2RestartProcessNames> {
  pm2RestartProcessNamesPromise ??= (async () => {
    const pm2ConfigUrl = pathToFileURL(
      resolve(ADMIN_REPO_ROOT, "pm2.config.js"),
    ).href;
    const pm2Config = await import(pm2ConfigUrl);

    return parsePm2RestartProcessNames(pm2Config.PM2_PROCESS_NAMES);
  })().catch((error: unknown) => {
    pm2RestartProcessNamesPromise = undefined;
    throw error;
  });

  return await pm2RestartProcessNamesPromise;
}

function toError(error: unknown, message: string) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(message, {
    cause: error,
  });
}

async function connectPm2(client: Pm2Client, timeoutMs: number) {
  await new Promise<void>((resolvePromise, reject) => {
    let didSettle = false;
    const timeout = setTimeout(() => {
      didSettle = true;
      reject(
        new Pm2RestartOperationError({
          code: "pm2-connect-timeout",
          message: "Timed out connecting to PM2.",
          phase: "connect",
          publicMessage: "Timed out connecting to PM2.",
        }),
      );
    }, timeoutMs);

    client.connect((error) => {
      if (didSettle) {
        if (!error) {
          try {
            client.disconnect();
          } catch {
            // Best effort cleanup for a PM2 connect callback that arrives late.
          }
        }

        return;
      }

      didSettle = true;
      clearTimeout(timeout);

      if (error) {
        reject(
          new Pm2RestartOperationError({
            cause: error,
            code: "pm2-connect-failed",
            message: toError(error, "Failed to connect to PM2.").message,
            phase: "connect",
            publicMessage: "Failed to connect to PM2.",
          }),
        );
        return;
      }

      resolvePromise();
    });
  });
}

function createDeferredCompletion() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  promise.catch(() => {
    // Avoid unhandled rejections when callers only care about the timeout.
  });

  return {
    promise,
    reject,
    resolve,
  };
}

async function restartPm2Process(
  client: Pm2Client,
  processName: string,
  service: Pm2RestartService,
  timeoutMs: number,
) {
  const completion = createDeferredCompletion();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  let didSettle = false;

  const clearRestartTimeout = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  };

  await new Promise<void>((resolvePromise, reject) => {
    timeout = setTimeout(() => {
      if (didSettle) {
        return;
      }

      didSettle = true;
      reject(
        new Pm2RestartTimeoutError({
          completion: completion.promise,
          message: `Timed out restarting ${processName}.`,
          processName,
          service,
        }),
      );
    }, timeoutMs);

    try {
      client.restart(processName, (error) => {
        const restartError = error
          ? new Pm2RestartOperationError({
              cause: error,
              code: "pm2-restart-failed",
              message: toError(error, `Failed to restart ${processName}.`)
                .message,
              phase: "restart",
              processName,
              publicMessage: `Failed to restart ${processName}.`,
              service,
            })
          : undefined;

        clearRestartTimeout();

        if (restartError) {
          completion.reject(restartError);
        } else {
          completion.resolve();
        }

        if (didSettle) {
          return;
        }

        didSettle = true;

        if (restartError) {
          reject(restartError);
          return;
        }

        resolvePromise();
      });
    } catch (error) {
      const restartError = new Pm2RestartOperationError({
        cause: error,
        code: "pm2-restart-failed",
        message: toError(error, `Failed to restart ${processName}.`).message,
        phase: "restart",
        processName,
        publicMessage: `Failed to restart ${processName}.`,
        service,
      });

      clearRestartTimeout();
      completion.reject(restartError);

      if (!didSettle) {
        didSettle = true;
        reject(restartError);
      }
    }
  });
}

async function describePm2Process(
  client: Pm2Client,
  processName: string,
  timeoutMs: number,
): Promise<Pm2RestartProcessStatus> {
  const describe = (client as Pm2DescribeClient).describe;

  if (typeof describe !== "function") {
    throw new Pm2RestartOperationError({
      code: "pm2-status-unknown",
      message: "PM2 describe API is unavailable.",
      phase: "status",
      processName,
      publicMessage: "PM2 restart status unknown. Check PM2 before retrying.",
    });
  }

  return await new Promise((resolvePromise, reject) => {
    let didSettle = false;
    const timeout = setTimeout(() => {
      didSettle = true;
      reject(
        new Pm2RestartOperationError({
          code: "pm2-status-unknown",
          message: `Timed out reading PM2 status for ${processName}.`,
          phase: "status",
          processName,
          publicMessage:
            "PM2 restart status unknown. Check PM2 before retrying.",
        }),
      );
    }, timeoutMs);

    describe.call(client, processName, (error, descriptions = []) => {
      if (didSettle) {
        return;
      }

      didSettle = true;
      clearTimeout(timeout);

      if (error) {
        reject(
          new Pm2RestartOperationError({
            cause: error,
            code: "pm2-status-unknown",
            message: toError(
              error,
              `Failed to read PM2 status for ${processName}.`,
            ).message,
            phase: "status",
            processName,
            publicMessage:
              "PM2 restart status unknown. Check PM2 before retrying.",
          }),
        );
        return;
      }

      const description = descriptions[0];

      resolvePromise({
        exists: description !== undefined,
        pid: description?.pid,
        processName,
        restartTime: description?.pm2_env?.restart_time,
        status: description?.pm2_env?.status,
      });
    });
  });
}

export async function getPm2RestartProcessStatus({
  client = pm2Client,
  processName,
  timeoutMs = PM2_RESTART_STATUS_TIMEOUT_MS,
}: {
  client?: Pm2Client;
  processName: string;
  timeoutMs?: number;
}): Promise<Pm2RestartProcessStatus> {
  let didConnect = false;
  let disconnectError: unknown;
  let status: Pm2RestartProcessStatus | undefined;

  try {
    await connectPm2(client, timeoutMs);
    didConnect = true;
    status = await describePm2Process(client, processName, timeoutMs);
  } catch (error) {
    if (error instanceof Pm2RestartOperationError) {
      throw error;
    }

    throw new Pm2RestartOperationError({
      cause: error,
      code: "pm2-status-unknown",
      message: toError(error, `Failed to read PM2 status for ${processName}.`)
        .message,
      phase: "status",
      processName,
      publicMessage: "PM2 restart status unknown. Check PM2 before retrying.",
    });
  } finally {
    if (didConnect) {
      try {
        client.disconnect();
      } catch (error) {
        disconnectError = error;
      }
    }
  }

  if (!status) {
    if (disconnectError) {
      throw new Pm2RestartOperationError({
        cause: disconnectError,
        code: "pm2-status-unknown",
        message: toError(disconnectError, "Failed to disconnect from PM2.")
          .message,
        phase: "status",
        processName,
        publicMessage: "PM2 restart status unknown. Check PM2 before retrying.",
      });
    }

    throw new Pm2RestartOperationError({
      code: "pm2-status-unknown",
      message: `Failed to read PM2 status for ${processName}.`,
      phase: "status",
      processName,
      publicMessage: "PM2 restart status unknown. Check PM2 before retrying.",
    });
  }

  return status;
}

export function getPm2RestartFailureDetails(
  error: unknown,
  fallbackService?: Pm2RestartService,
) {
  if (error instanceof Pm2RestartOperationError) {
    return {
      code: error.code,
      message: error.publicMessage,
      processName: error.processName,
      service: error.service ?? fallbackService,
    };
  }

  return {
    code: "pm2-restart-failed" as const,
    message: "Failed to restart PM2 process.",
    service: fallbackService,
  };
}

export async function restartPm2Service({
  client = pm2Client,
  connectTimeoutMs = PM2_RESTART_CONNECT_TIMEOUT_MS,
  onProgress,
  restartTimeoutMs = PM2_RESTART_PROCESS_TIMEOUT_MS,
  service,
}: {
  client?: Pm2Client;
  connectTimeoutMs?: number;
  onProgress?: Pm2RestartProgressReporter;
  restartTimeoutMs?: number;
  service: Pm2RestartService;
}): Promise<Pm2RestartResult> {
  await onProgress?.({
    type: "resolving-process",
    service,
    message: "Resolving PM2 process name.",
  });

  const restartProcessNames = await getPm2RestartProcessNames();
  const processName = restartProcessNames[service];
  let didConnect = false;
  let operationError: unknown;
  let result: Pm2RestartResult | undefined;

  try {
    await onProgress?.({
      type: "connecting",
      service,
      processName,
      message: `Connecting to PM2 for ${processName}.`,
    });

    await connectPm2(client, connectTimeoutMs);
    didConnect = true;

    await onProgress?.({
      type: "restarting",
      service,
      processName,
      message: `Restarting ${processName}.`,
    });

    await restartPm2Process(client, processName, service, restartTimeoutMs);

    result = {
      ok: true,
      processName,
      restartedAt: new Date().toISOString(),
      service,
    };
  } catch (error) {
    operationError = error;
  } finally {
    if (didConnect) {
      await onProgress?.({
        type: "disconnecting",
        service,
        processName,
        message: `Disconnecting from PM2 after restarting ${processName}.`,
      });

      try {
        client.disconnect();
      } catch (disconnectError) {
        if (result) {
          logKioskEvent(
            "warn",
            ADMIN_PM2_CONTROL_LOG_SOURCE,
            "pm2-disconnect-after-restart-failed",
            {
              details: {
                processName,
                service,
              },
              error: getKioskErrorDiagnostics(
                disconnectError,
                "PM2 restart completed, but disconnect failed.",
              ),
            },
          );
        } else if (!operationError) {
          operationError = toError(
            disconnectError,
            "Failed to disconnect from PM2.",
          );
        }
      }
    }
  }

  if (operationError) {
    throw operationError;
  }

  if (!result) {
    throw new Error("Failed to restart PM2 process.");
  }

  return result;
}
