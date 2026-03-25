import { getPort } from "@dither-booth/ports";
import USB from "@node-escpos/usb-adapter";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import http from "node:http";

import type { Context } from "./trpc";

import { appRouter } from "./appRouter";

let printerDevice: USB | undefined;

try {
  printerDevice = new USB();
} catch (error) {
  console.error(error);
}

const createContext = (): Context => ({
  printerDevice,
});

const trpcHandler = createHTTPHandler({
  router: appRouter,
  createContext,
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

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  trpcHandler(req, res);
});

server.listen(getPort("API_PORT"), "127.0.0.1");

const address = server.address();

if (address && typeof address !== "string") {
  console.log(
    `🚀 API server running at http://${address.address}:${address.port}`,
  );
  console.log(`Environment: ${process.env.NODE_ENV}`);
}
