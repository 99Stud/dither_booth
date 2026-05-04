import index from "./index.html";
import { runAdminServer } from "./server-app";

await runAdminServer({ mode: "production", indexHtml: index });
