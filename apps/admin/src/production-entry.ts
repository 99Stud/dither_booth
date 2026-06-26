import { getProductionEntryAppRoot } from "@dither-booth/shared/paths";

const appRoot = getProductionEntryAppRoot(import.meta.url);

process.chdir(appRoot);

await import("./production-server");
