import type { FC } from "react";

import { buttonVariants } from "@dither-booth/ui/components/ui/button";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { Cpu, Gauge } from "lucide-react";

import type { StatusDotVariant } from "#components/Misc/StatusDot/internal/StatusDot.types";
import type { SystemSnapshot } from "#lib/system/system.protocol";

import { HealthAccordionShell } from "#components/App/ControlCenter/HealthCard/internal/components/HealthAccordionShell/index";
import { HealthDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthDetailRow/index";
import { SYSTEM_PAGE_PATH } from "#lib/system/system.constants";
import {
  activeThrottleFlags,
  READ_ON_THE_BOOTH_TEXT,
  TEMPERATURE_LABELS,
  formatBytes,
  formatPercent,
  freePercent,
  getOverallSystemStatus,
  getStatusDotVariant,
  getTemperatureStatus,
} from "#lib/system/system.utils";

const describeThrottle = (throttle: SystemSnapshot["thermal"]["throttle"]) => {
  if (!throttle) {
    return READ_ON_THE_BOOTH_TEXT;
  }

  const now = activeThrottleFlags(throttle.now);
  const sinceBoot = activeThrottleFlags(throttle.sinceBoot);

  if (now.length > 0) {
    return `Now: ${now.map((flag) => flag.label.toLowerCase()).join(", ")}`;
  }

  if (sinceBoot.length > 0) {
    return `Since boot: ${sinceBoot.map((flag) => flag.label.toLowerCase()).join(", ")}`;
  }

  return "None since boot";
};

interface SystemAccordionItemProps {
  snapshot?: SystemSnapshot;
  isPending: boolean;
  isError: boolean;
}

/**
 * The Pi at a glance, from the same reading as the System page: is it
 * hot, throttling, out of memory or out of disk. The page has the detail.
 */
export const SystemAccordionItem: FC<SystemAccordionItemProps> = ({
  snapshot,
  isPending,
  isError,
}) => {
  const status = snapshot ? getOverallSystemStatus(snapshot) : null;
  const statusVariant: StatusDotVariant = isPending
    ? "pending"
    : isError && !snapshot
      ? "error"
      : getStatusDotVariant(status);
  const temperatureStatus = getTemperatureStatus(
    snapshot?.thermal.celsius ?? null,
  );

  return (
    <HealthAccordionShell
      value="system"
      label="Pi"
      icon={<Cpu />}
      statusDotSize="sm"
      statusVariant={statusVariant}
      footer={
        <Link
          to={SYSTEM_PAGE_PATH}
          className={clsx(
            buttonVariants({ variant: "link", size: "sm" }),
            "mb-2 h-auto px-0 text-muted-foreground hover:text-foreground",
          )}
        >
          <Gauge />
          View system
        </Link>
      }
    >
      {snapshot ? (
        <>
          <HealthDetailRow label="Temperature">
            {snapshot.thermal.celsius === null || temperatureStatus === null
              ? READ_ON_THE_BOOTH_TEXT
              : `${snapshot.thermal.celsius.toFixed(1)} °C, ${TEMPERATURE_LABELS[temperatureStatus].toLowerCase()}`}
          </HealthDetailRow>
          <HealthDetailRow label="Throttling">
            {describeThrottle(snapshot.thermal.throttle)}
          </HealthDetailRow>
          <HealthDetailRow label="Memory">
            {snapshot.memory.availableBytes === null
              ? READ_ON_THE_BOOTH_TEXT
              : `${formatBytes(snapshot.memory.availableBytes)} available (${formatPercent(freePercent(snapshot.memory.availableBytes, snapshot.memory.totalBytes))})`}
          </HealthDetailRow>
          <HealthDetailRow label="Storage">
            {snapshot.disks.length === 0
              ? "No disks found"
              : snapshot.disks
                  .map(
                    (disk) =>
                      `${disk.label} ${formatPercent(freePercent(disk.freeBytes, disk.totalBytes))} free`,
                  )
                  .join(", ")}
          </HealthDetailRow>
        </>
      ) : (
        <p className={clsx("text-muted-foreground")}>
          {isError ? "The admin server didn't answer." : "Reading the Pi..."}
        </p>
      )}
    </HealthAccordionShell>
  );
};
