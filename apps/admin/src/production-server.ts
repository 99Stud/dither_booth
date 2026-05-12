import { ADMIN_SERVER_LOG_SOURCE } from "#lib/constants";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";

import index from "./index.html";
import { runAdminServer } from "./server-app";

const adminServer = await runAdminServer({
  mode: "production",
  indexHtml: index,
});

async function shutdown() {
  logKioskEvent("info", ADMIN_SERVER_LOG_SOURCE, "server-shutdown-started");

  try {
    await adminServer.close();
    logKioskEvent("info", ADMIN_SERVER_LOG_SOURCE, "server-shutdown-completed");
    process.exit(0);
  } catch (error) {
    logKioskEvent("error", ADMIN_SERVER_LOG_SOURCE, "server-shutdown-failed", {
      error: getKioskErrorDiagnostics(error, "Admin server shutdown failed."),
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
