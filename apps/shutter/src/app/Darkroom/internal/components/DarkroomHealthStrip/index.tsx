import type { FC, ReactNode } from "react";

import { Badge } from "@dither-booth/ui/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { FileImage, Printer, Server, Tablet } from "lucide-react";

import { useTRPC } from "#lib/trpc/trpc.client";

import { DARKROOM_HEALTH_REFRESH_MS } from "../../Darkroom.constants";

const StatusChip: FC<{
  icon: ReactNode;
  label: string;
  ok: boolean | undefined;
}> = ({ icon, label, ok }) => (
  <Badge
    variant="outline"
    className={clsx("h-7 gap-1.5 px-2.5 text-xs font-medium")}
  >
    <span
      aria-hidden
      className={clsx("text-muted-foreground [&_svg]:size-3.5")}
    >
      {icon}
    </span>
    {label}
    <span
      aria-hidden
      className={clsx(
        "size-2 rounded-full",
        ok === undefined && "animate-pulse bg-muted-foreground/50",
        ok === true && "bg-success",
        ok === false && "bg-destructive",
      )}
    />
    <span className={clsx("sr-only")}>
      {ok === undefined ? "checking" : ok ? "ok" : "not ok"}
    </span>
  </Badge>
);

/** Printer, ticket renderer, engine and Shutter, refreshed every 10 s. */
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
      aria-label="Booth status"
      className={clsx("flex flex-wrap items-center gap-2")}
      role="status"
    >
      <StatusChip
        icon={<Printer />}
        label="Printer"
        ok={status(healthz?.printer.healthz.ok)}
      />
      <StatusChip
        icon={<FileImage />}
        label="Ticket renderer"
        ok={status(healthz?.puppeteer.healthz.ok)}
      />
      <StatusChip
        icon={<Server />}
        label="Engine"
        ok={status(healthz?.engine.healthz.ok)}
      />
      <StatusChip
        icon={<Tablet />}
        label="Shutter"
        ok={status(healthz?.shutter.healthz.ok)}
      />
    </div>
  );
};
