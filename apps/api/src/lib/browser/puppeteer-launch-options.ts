import puppeteer from "puppeteer";

export function getPuppeteerLaunchOptions(): NonNullable<Parameters<typeof puppeteer.launch>[0]> {
  const puppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  const launchOptions: NonNullable<Parameters<typeof puppeteer.launch>[0]> = {
    args: [
      "--ignore-certificate-errors",
      "--allow-insecure-localhost",
      ...(puppeteerExecutablePath
        ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        : []),
    ],
  };
  if (puppeteerExecutablePath) {
    launchOptions.executablePath = puppeteerExecutablePath;
  }
  return launchOptions;
}
