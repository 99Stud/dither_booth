import type { FC } from "react";

import { buttonVariants } from "@dither-booth/ui/components/ui/button";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { PackageCheck } from "lucide-react";

import type { StatusDotVariant } from "#components/Misc/StatusDot/internal/StatusDot.types";

import { HealthAccordionShell } from "#components/App/ControlCenter/HealthCard/internal/components/HealthAccordionShell/index";
import { HealthDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthDetailRow/index";
import { SYSTEM_PAGE_PATH } from "#lib/system/system.constants";
import { getStatusDotVariant } from "#lib/system/system.utils";
import { getSoftwareStatus } from "#lib/update/update.utils";
import { useUpdateSnapshot } from "#lib/update/useUpdateSnapshot";

/**
 * The booth's software at a glance: the release it runs, and whether a
 * newer one waits or the last update went wrong. The System page does
 * the updating. Off the booth it says so and nothing more.
 */
export const SoftwareAccordionItem: FC = () => {
  const { data: snapshot, isPending } = useUpdateSnapshot();
  const software = getSoftwareStatus(snapshot);
  const statusVariant: StatusDotVariant = isPending
    ? "pending"
    : getStatusDotVariant(software.status);

  return (
    <HealthAccordionShell
      value="software"
      label="Software"
      icon={<PackageCheck />}
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
          <PackageCheck />
          {snapshot?.updateAvailable ? "Update in System" : "View in System"}
        </Link>
      }
    >
      {snapshot ? (
        <>
          <HealthDetailRow label="Runs">{snapshot.release}</HealthDetailRow>
          <HealthDetailRow label="Latest">
            {snapshot.latest
              ? snapshot.updateAvailable
                ? `${snapshot.latest.version}, ready to install`
                : snapshot.latest.version
              : software.label}
          </HealthDetailRow>
        </>
      ) : (
        <p className={clsx("text-muted-foreground")}>
          {snapshot === null ? "Only on the booth." : "Reading the booth..."}
        </p>
      )}
    </HealthAccordionShell>
  );
};
