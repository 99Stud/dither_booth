import type { FC } from "react";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

import { useTRPC } from "#lib/trpc/trpc.client";

import { DARKROOM_HEALTH_REFRESH_MS } from "../../Darkroom.constants";

const StatusItem: FC<{ label: string; ok: boolean | undefined }> = ({
  label,
  ok,
}) => (
  <span className={clsx("inline-flex items-center gap-1.5")}>
    <span
      aria-hidden
      className={clsx(
        "size-2 rounded-full",
        ok === undefined && "animate-pulse bg-gray-500",
        ok === true && "bg-green-500",
        ok === false && "bg-red-500",
      )}
    />
    {label}
    <span className={clsx("sr-only")}>
      {ok === undefined ? "checking" : ok ? "ok" : "not ok"}
    </span>
  </span>
);

/** Printer, receipt renderer, engine and Shutter, refreshed every 10 s. */
export const DarkroomHealthStrip: FC = () => {
  const trpc = useTRPC();
  const { data: healthz, isError } = useQuery(
    trpc.ops.getHealthz.queryOptions(undefined, {
      refetchInterval: DARKROOM_HEALTH_REFRESH_MS,
    }),
  );
  const status = (ok: boolean | undefined) => (isError ? false : ok);

  return (
    <div
      className={clsx(
        "h-10 px-3",
        "flex items-center gap-5",
        "text-sm text-muted-foreground",
      )}
    >
      <StatusItem label="Printer" ok={status(healthz?.printer.healthz.ok)} />
      <StatusItem
        label="Receipt renderer"
        ok={status(healthz?.puppeteer.healthz.ok)}
      />
      <StatusItem label="Engine" ok={status(healthz?.engine.healthz.ok)} />
      <StatusItem label="Shutter" ok={status(healthz?.shutter.healthz.ok)} />
    </div>
  );
};
