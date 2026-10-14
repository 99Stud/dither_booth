import index from "./index.html";
import { runShutterServer } from "./server-app";

await runShutterServer({ mode: "development", indexHtml: index });
