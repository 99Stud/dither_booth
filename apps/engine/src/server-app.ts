import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { getPort } from "@dither-booth/ports";
import { DARKROOM_TOKEN_HEADER } from "@dither-booth/shared/darkroom";
import {
  ENGINE_HEALTHZ_SERVICE,
  createHealthzPayload,
} from "@dither-booth/shared/healthz";
import { SETUP_SERVER_TOKEN_HEADER } from "@dither-booth/shared/server/network";
import { assertNonProductionNodeEnvForDevelopmentMode } from "@dither-booth/shared/server/runtime";
import {
  createHTTPHandler,
  type CreateHTTPContextOptions,
} from "@trpc/server/adapters/standalone";
import http from "node:http";

import type { TRPCContext } from "#lib/trpc/trpc.types";

import { createProductionEngine } from "#internal/production-engine";
import { engineRouter } from "#internal/router";
import {
  ENGINE_SERVER_BIND_HOST,
  ENGINE_SERVER_LOG_SOURCE,
  ENGINE_SERVER_ORIGIN,
} from "#lib/server/server.constants";

type EngineServerLifecycle = {
  close: () => Promise<void>;
  server: http.Server;
};

async function closeHttpServer(server: http.Server) {
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolvePromise();
    });
  });
}

export async function runEngineServer(options: {
  mode: "development" | "production";
}): Promise<EngineServerLifecycle> {
  assertNonProductionNodeEnvForDevelopmentMode({
    mode: options.mode,
    serverName: "runEngineServer",
  });

  const engine = await createProductionEngine({ mode: options.mode });

  const header = (req: http.IncomingMessage, name: string) => {
    const value = req.headers[name];
    return typeof value === "string" ? value : undefined;
  };

  const createContext = ({ req }: CreateHTTPContextOptions): TRPCContext => ({
    ...engine.services,
    request: {
      origin: req.headers.origin,
      darkroomToken: header(req, DARKROOM_TOKEN_HEADER),
      setupServerToken: header(req, SETUP_SERVER_TOKEN_HEADER),
    },
  });

  const trpcHandler = createHTTPHandler({
    router: engineRouter,
    createContext,
    onError({ error, path, req, type }) {
      logKioskEvent("error", ENGINE_SERVER_LOG_SOURCE, "trpc-request-failed", {
        details: {
          code: error.code,
          method: req.method,
          ...(path ? { path } : {}),
          type,
          url: req.url,
        },
        error: getKioskErrorDiagnostics(
          error,
          error.message || "Engine request failed.",
        ),
      });
    },
  });

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS, PUT, PATCH, DELETE",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ?? "Content-Type",
    );

    const url = new URL(req.url ?? "/", ENGINE_SERVER_ORIGIN);

    if (url.pathname === "/healthz") {
      if (req.method !== "GET") {
        res.writeHead(405, {
          Allow: "GET",
        });
        res.end();
        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify(
          createHealthzPayload({
            mode: options.mode,
            service: ENGINE_HEALTHZ_SERVICE,
          }),
        ),
      );
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    trpcHandler(req, res);
  });

  // Bind before Puppeteer init so the shutter and admin proxies are not refused while Chrome starts.
  server.listen(getPort("ENGINE_PORT"), ENGINE_SERVER_BIND_HOST);

  const address = server.address();

  if (address && typeof address !== "string") {
    logKioskEvent("info", ENGINE_SERVER_LOG_SOURCE, "server-started", {
      details: {
        environment: process.env.NODE_ENV,
        processManager: engine.services.processManager,
        boundAddress: `${address.address}:${address.port}`,
        url: ENGINE_SERVER_ORIGIN,
      },
    });
  }

  await engine.start();

  let closePromise: Promise<void> | undefined;

  const close = () => {
    closePromise ??= (async () => {
      logKioskEvent(
        "info",
        ENGINE_SERVER_LOG_SOURCE,
        "server-shutdown-started",
      );

      const errors: unknown[] = [];

      try {
        await closeHttpServer(server);
      } catch (error) {
        errors.push(error);
        logKioskEvent(
          "error",
          ENGINE_SERVER_LOG_SOURCE,
          "server-shutdown-failed",
          {
            details: { resource: "http-server" },
            error: getKioskErrorDiagnostics(error, "Engine shutdown failed."),
          },
        );
      }

      // The engine logs each of its own failures.
      await engine.stop().catch((error: unknown) => {
        errors.push(
          ...(error instanceof AggregateError ? error.errors : [error]),
        );
      });

      if (errors.length > 0) {
        throw new AggregateError(errors, "engine server shutdown failed.");
      }

      logKioskEvent(
        "info",
        ENGINE_SERVER_LOG_SOURCE,
        "server-shutdown-completed",
      );
    })();

    return closePromise;
  };

  return {
    close,
    server,
  };
}
