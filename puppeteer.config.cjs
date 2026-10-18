const { join } = require("node:path");

// Chrome for Testing has no Linux arm64 build, so on the Pi Puppeteer would
// download an x86-64 Chrome that fails with ENOEXEC. There it uses Debian's
// Chromium instead, which `booth install` installs with apt.
const useSystemChromium =
  process.platform === "linux" && process.arch === "arm64";

/** @type {import("puppeteer").Configuration} */
module.exports = {
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
  ...(useSystemChromium && {
    executablePath: "/usr/bin/chromium",
    chrome: { skipDownload: true },
    "chrome-headless-shell": { skipDownload: true },
  }),
};
