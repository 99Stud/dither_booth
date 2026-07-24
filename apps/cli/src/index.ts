#!/usr/bin/env bun
import tab from "@bomb.sh/tab/citty";
import { createMain } from "citty";

import { initSession } from "#internal/session";
import { main, showBoothUsage } from "#main";

// Color/session must be ready before help/completions print anything.
initSession({
  yes: process.argv.includes("-y") || process.argv.includes("--yes"),
  noBanner:
    process.argv.includes("--no-banner") ||
    process.argv.includes("--noBanner") ||
    Boolean(process.env.BOOTH_NO_BANNER),
  color: (() => {
    const eq = process.argv.find((arg) => arg.startsWith("--color="));
    if (eq) {
      return eq.slice("--color=".length);
    }
    const idx = process.argv.indexOf("--color");
    if (idx >= 0) {
      return process.argv[idx + 1];
    }
    return "auto";
  })(),
});

await tab(main);

await createMain(main)({
  showUsage: showBoothUsage,
});
