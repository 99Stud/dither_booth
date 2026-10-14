import { runApiServer } from "./server-app";

const apiServer = await runApiServer({ mode: "production" });

async function shutdown() {
  try {
    await apiServer.close();
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
