import index from "./index.html";
import { runWebServer } from "./server-app";

await runWebServer({ mode: "production", indexHtml: index });
