import type { FC } from "react";

import { Progress } from "@dither-booth/ui/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dither-booth/ui/components/ui/table";
import clsx from "clsx";
import { HardDrive } from "lucide-react";

import type { SystemSample } from "#lib/system/system.protocol";
import type { SystemStatus } from "#lib/system/system.utils";

import {
  formatBytes,
  freePercent,
  getDiskStatus,
  getStatusLabel,
  getStorageStatus,
} from "#lib/system/system.utils";

import { useTweenedNumber } from "../../hooks/useTweenedNumber";
import { progressToneClassName } from "../../System.utils";
import { SystemPanel } from "../SystemPanel";

const STORAGE_LABELS: Record<SystemStatus, string> = {
  ok: "Room to spare",
  warning: "Running low",
  critical: "Nearly full",
};

const DiskRow: FC<{ disk: SystemSample["disks"][number] }> = ({ disk }) => {
  const status = getDiskStatus(disk);
  const usedPercent = useTweenedNumber(
    100 - freePercent(disk.freeBytes, disk.totalBytes),
    1,
  );

  return (
    <TableRow>
      <TableCell>
        <span className={clsx("font-medium")}>{disk.label}</span>
        <span className={clsx("block font-mono text-xs text-muted-foreground")}>
          {disk.mount}
        </span>
      </TableCell>
      <TableCell className={clsx("w-[38%]")}>
        <Progress
          aria-label={`${disk.label} used`}
          value={usedPercent ?? 0}
          className={clsx(progressToneClassName(status))}
        />
      </TableCell>
      <TableCell className={clsx("text-right whitespace-nowrap tabular-nums")}>
        {formatBytes(disk.freeBytes)}
        <span className={clsx("text-muted-foreground")}>
          {" "}
          free of {formatBytes(disk.totalBytes)}
        </span>
      </TableCell>
    </TableRow>
  );
};

/**
 * The microSD the Pi boots from and the SSD with the data: a full disk
 * stops prints and photos. PM2 logs rotate; photos and fonts grow.
 */
export const StoragePanel: FC<{ disks: SystemSample["disks"] }> = ({
  disks,
}) => {
  const status = getStorageStatus(disks);

  return (
    <SystemPanel
      title="Storage"
      icon={<HardDrive />}
      tone="sky"
      status={status}
      statusLabel={
        disks.length === 0
          ? "No disks found"
          : getStatusLabel(status, STORAGE_LABELS)
      }
      className={clsx("lg:col-span-6")}
    >
      {disks.length === 0 ? (
        <p className={clsx("text-sm text-muted-foreground")}>
          Neither the microSD nor the SSD is mounted on this machine.
        </p>
      ) : (
        <Table aria-label="Disks">
          <TableHeader>
            <TableRow>
              <TableHead>Disk</TableHead>
              <TableHead>Used</TableHead>
              <TableHead className={clsx("text-right")}>Free</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {disks.map((disk) => (
              <DiskRow key={disk.mount} disk={disk} />
            ))}
          </TableBody>
        </Table>
      )}
    </SystemPanel>
  );
};
