const appRoot = Bun.fileURLToPath(new URL("../", import.meta.url));

process.chdir(appRoot);

await import("./production-server");
