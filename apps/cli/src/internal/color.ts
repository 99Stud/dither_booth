export type ColorMode = "auto" | "always" | "never";

export type ColorName =
  | "reset"
  | "bold"
  | "dim"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "orange";

const SGR: Record<ColorName, string> = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  // Flipper-style signature orange via 256-color palette (index 208).
  orange: "\x1b[38;5;208m",
};

let colorEnabled = false;

// Resolution order follows no-color.org and bixense.com/clicolors:
// explicit flag/CLICOLOR_FORCE -> NO_COLOR -> TERM=dumb -> TTY check.
export function resolveColorEnabled(mode: ColorMode): boolean {
  if (mode === "never") {
    return false;
  }

  if (process.env.NO_COLOR) {
    return false;
  }

  if (mode === "always" || process.env.CLICOLOR_FORCE) {
    return true;
  }

  if (process.env.TERM === "dumb") {
    return false;
  }

  return Boolean(process.stdout.isTTY);
}

export function initColor(mode: ColorMode): void {
  colorEnabled = resolveColorEnabled(mode);
}

export function isColorEnabled(): boolean {
  return colorEnabled;
}

export function colorize(value: string, ...names: ColorName[]): string {
  if (!colorEnabled || names.length === 0) {
    return value;
  }

  const prefix = names.map((name) => SGR[name]).join("");

  return `${prefix}${value}${SGR.reset}`;
}
