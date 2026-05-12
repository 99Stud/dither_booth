import { WEB_SERVER_LOG_SOURCE } from "#lib/constants";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";

import index from "./index.html";
import { runWebServer } from "./server-app";

const webServer = await runWebServer({ mode: "production", indexHtml: index });

async function shutdown() {
  logKioskEvent("info", WEB_SERVER_LOG_SOURCE, "server-shutdown-started");

  try {
    await webServer.close();
    logKioskEvent("info", WEB_SERVER_LOG_SOURCE, "server-shutdown-completed");
    process.exit(0);
  } catch (error) {
    logKioskEvent("error", WEB_SERVER_LOG_SOURCE, "server-shutdown-failed", {
      error: getKioskErrorDiagnostics(error, "Web server shutdown failed."),
    });
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
