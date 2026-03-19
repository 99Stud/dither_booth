import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import http from "node:http";
import { appRouter } from "./appRouter";

const trpcHandler = createHTTPHandler({
  router: appRouter,
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

server.listen(3000);
