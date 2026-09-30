import type { ColorMode } from "#internal/color";

import { initColor } from "#internal/color";

export type BoothSession = {
  assumeYes: boolean;
  noBanner: boolean;
  color: ColorMode;
};

const session: BoothSession = {
  assumeYes: false,
  noBanner: false,
  color: "auto",
};

function parseColorMode(value: unknown): ColorMode {
  if (value === "always" || value === "never" || value === "auto") {
    return value;
  }

  return "auto";
}

// Parent Citty args are parsed from the full argv, so global flags work both
// before and after the subcommand name (`booth --yes install` / `booth install -y`).
export function initSession(args: {
  yes?: boolean;
  color?: string;
  noBanner?: boolean;
}): void {
  session.assumeYes = Boolean(args.yes);
  session.noBanner =
    Boolean(args.noBanner) || Boolean(process.env.BOOTH_NO_BANNER);
  session.color = parseColorMode(args.color);

  initColor(session.color);

  if (session.color === "never") {
    process.env.NO_COLOR = "1";
  }
}

export function getSession(): BoothSession {
  return session;
}
