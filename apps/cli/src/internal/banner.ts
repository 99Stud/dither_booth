import figlet from "figlet";
import standardFont from "figlet/importable-fonts/Standard.js";

import type { ColorName } from "#internal/color";

import { colorize, isColorEnabled } from "#internal/color";

export type BannerOptions = {
  noBanner?: boolean;
};

const FIGLET_OPTIONS = {
  horizontalLayout: "fitted" as const,
  whitespaceBreak: false,
};

figlet.parseFont("Standard", standardFont);

function figletText(text: string): string {
  return figlet.textSync(text, { font: "Standard", ...FIGLET_OPTIONS });
}

function colorLines(text: string, ...colors: ColorName[]): string {
  if (!isColorEnabled()) {
    return text;
  }

  return text
    .split("\n")
    .map((line) => (line.length === 0 ? line : colorize(line, ...colors)))
    .join("\n");
}

function renderSubtitle(): string {
  if (!isColorEnabled()) {
    return "by 99stud";
  }

  return `${colorize("by ", "dim")}${colorize("99stud", "orange")}`;
}

export function renderBanner(options: BannerOptions = {}): string {
  if (options.noBanner || !process.stdout.isTTY) {
    return "";
  }

  const title = figletText("Dither booth");
  const tagline = isColorEnabled()
    ? colorize("raspberry pi provisioning toolkit", "gray")
    : "raspberry pi provisioning toolkit";

  const lines = [colorLines(title, "orange"), "", renderSubtitle(), tagline];

  return `\n${lines.join("\n")}\n`;
}

export function printBanner(options: BannerOptions = {}): void {
  const banner = renderBanner(options);

  if (banner.length > 0) {
    process.stdout.write(banner);
  }
}
