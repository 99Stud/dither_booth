import { runEngineServer } from "./server-app";

const engineServer = await runEngineServer({ mode: "production" });

async function shutdown() {
  try {
    await engineServer.close();
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
