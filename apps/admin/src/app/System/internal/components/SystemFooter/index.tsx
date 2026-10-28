import type { FC } from "react";

import { Separator } from "@dither-booth/ui/components/ui/separator";
import clsx from "clsx";
import { format } from "date-fns";

import type { SystemSnapshot } from "#lib/system/system.protocol";

import {
  SYSTEM_HISTORY_SAMPLES,
  SYSTEM_SAMPLE_INTERVAL_MS,
} from "#lib/system/system.constants";
import { formatUptime } from "#lib/system/system.utils";

const Divider: FC = () => (
  <Separator
    orientation="vertical"
    className={clsx("h-3.5 self-center max-sm:hidden")}
  />
);

/** The page ends on purpose: what this is, since when, read how often. */
export const SystemFooter: FC<{ snapshot: SystemSnapshot; now: number }> = ({
  snapshot,
  now,
}) => (
  <footer
    className={clsx(
      "flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3",
    )}
  >
    <span>{snapshot.hardware.model ?? "Not a Raspberry Pi"}</span>
    <Divider />
    <span>
      Up {formatUptime(snapshot.hardware.bootedAt, now)}, since{" "}
      {format(Date.parse(snapshot.hardware.bootedAt), "EEE d MMM, HH:mm")}
    </span>
    <Divider />
    <span>
      Last read {format(Date.parse(snapshot.sampledAt), "HH:mm:ss")} by the Pi's
      clock
    </span>
    <Divider />
    <span>
      Read every {SYSTEM_SAMPLE_INTERVAL_MS / 1000} s, the last{" "}
      {(SYSTEM_HISTORY_SAMPLES * SYSTEM_SAMPLE_INTERVAL_MS) / 60_000} min kept
    </span>
  </footer>
);
