import type { ColorName } from "#internal/color";

import { colorize, isColorEnabled } from "#internal/color";

export type BannerOptions = {
  noBanner?: boolean;
};

type Pixel = "." | "1" | "p" | "e" | "n";

// Traced from the Dither Booth logo (side profile, facing left).
// 1 = fur, p = pink ear, e = eye, n = nose, . = empty.
const BUNNY: string[] = [
  "....11..11....",
  "....1p..1p....",
  "....1p..1p....",
  "...11111111...",
  "..11......111.",
  "..1e.e.....111",
  "..1.n.....1111",
  ".1111111111111",
  "11111111111111",
  "1111111111..11",
  "..11......11..",
];

const PIXEL_STYLE: Record<
  Exclude<Pixel, ".">,
  { char: string; color: ColorName }
> = {
  "1": { char: "█", color: "white" },
  p: { char: "▓", color: "magenta" },
  e: { char: "●", color: "gray" },
  n: { char: "·", color: "gray" },
};

const LCD_WIDTH = 26;

const LCD_ROWS: {
  segments: { text: string; color?: ColorName; bold?: boolean }[];
}[] = [
  {
    segments: [{ text: ".------------------------.", color: "orange" }],
  },
  {
    segments: [
      { text: "|  ", color: "orange" },
      { text: "DITHER", color: "yellow", bold: true },
      { text: " · ", color: "gray" },
      { text: "BOOTH", color: "yellow", bold: true },
      { text: "        |", color: "orange" },
    ],
  },
  {
    segments: [
      { text: "|  ", color: "orange" },
      { text: ">_ provisioning", color: "green" },
      { text: "       |", color: "orange" },
    ],
  },
  {
    segments: [
      { text: "|  ", color: "orange" },
      { text: "Crafted by ", color: "gray" },
      { text: "99stud", color: "orange", bold: true },
      { text: "     |", color: "orange" },
    ],
  },
  {
    segments: [
      { text: "|  ", color: "orange" },
      { text: "cam ", color: "gray" },
      { text: "▮▮▮▮▮", color: "orange" },
      { text: "▯▯", color: "dim" },
      { text: "  ok", color: "green" },
      { text: "       |", color: "orange" },
    ],
  },
  {
    segments: [{ text: "'------------------------'", color: "orange" }],
  },
];

function paint(text: string, color?: ColorName, bold?: boolean): string {
  if (!isColorEnabled()) {
    return text;
  }

  const colors: ColorName[] = [];

  if (bold) {
    colors.push("bold");
  }

  if (color) {
    colors.push(color);
  }

  return colorize(text, ...colors);
}

function renderPixelLine(line: string): string {
  let output = "";

  for (const cell of line) {
    if (cell === ".") {
      output += " ";
      continue;
    }

    const style = PIXEL_STYLE[cell as Exclude<Pixel, ".">];
    output += paint(style.char, style.color);
  }

  return output;
}

function renderLcdRow(row: (typeof LCD_ROWS)[number]): string {
  return row.segments
    .map((segment) => paint(segment.text, segment.color, segment.bold))
    .join("");
}

function assertLcdWidth(): void {
  for (const row of LCD_ROWS) {
    const width = row.segments.reduce(
      (total, segment) => total + segment.text.length,
      0,
    );

    if (width !== LCD_WIDTH) {
      throw new Error(`LCD row width ${width} != ${LCD_WIDTH}`);
    }
  }
}

assertLcdWidth();

export function renderBanner(options: BannerOptions = {}): string {
  if (options.noBanner || !process.stdout.isTTY) {
    return "";
  }

  const art = BUNNY.map(renderPixelLine).join("\n");
  const panel = LCD_ROWS.map(renderLcdRow).join("\n");
  const tagline =
    "  // dither booth - raspberry pi provisioning toolkit · Crafted by 99stud";
  const footer = isColorEnabled() ? colorize(tagline, "dim") : tagline;

  return `\n${art}\n\n${panel}\n${footer}\n`;
}

export function printBanner(options: BannerOptions = {}): void {
  const banner = renderBanner(options);

  if (banner.length > 0) {
    process.stdout.write(banner);
  }
}
