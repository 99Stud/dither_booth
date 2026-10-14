import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";

import { SHUTTER_SERVER_LOG_SOURCE } from "#lib/constants";

import index from "./index.html";
import { runShutterServer } from "./server-app";

const shutterServer = await runShutterServer({
  mode: "production",
  indexHtml: index,
});

async function shutdown() {
  logKioskEvent("info", SHUTTER_SERVER_LOG_SOURCE, "server-shutdown-started");

  try {
    await shutterServer.close();
    logKioskEvent(
      "info",
      SHUTTER_SERVER_LOG_SOURCE,
      "server-shutdown-completed",
    );
    process.exit(0);
  } catch (error) {
    logKioskEvent(
      "error",
      SHUTTER_SERVER_LOG_SOURCE,
      "server-shutdown-failed",
      {
        error: getKioskErrorDiagnostics(
          error,
          "Shutter server shutdown failed.",
        ),
      },
    );
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
