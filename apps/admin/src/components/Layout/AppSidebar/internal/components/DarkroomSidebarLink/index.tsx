import type { FC } from "react";

import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { SidebarMenuButton } from "@dither-booth/ui/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Printer } from "lucide-react";

import { useTRPC } from "#lib/trpc/trpc.client";

/**
 * Print tuning lives in the Shutter's Darkroom, behind its PIN. The link
 * opens it in a new tab, at the Shutter origin the engine reports.
 */
export const DarkroomSidebarLink: FC<{ isSidebarOpen: boolean }> = ({
  isSidebarOpen,
}) => {
  const trpc = useTRPC();
  const { data: healthz } = useQuery(
    trpc.ops.getHealthz.queryOptions(undefined, { staleTime: Infinity }),
  );
  const href = healthz
    ? new URL(DARKROOM_PATH, healthz.shutter.origin).toString()
    : undefined;

  return (
    <SidebarMenuButton tooltip="Darkroom (print tuning)">
      <a
        aria-disabled={!href}
        className={clsx(
          "w-full",
          "flex items-center gap-2",
          !href && "pointer-events-none opacity-50",
        )}
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        <Printer />
        <span
          className={clsx(
            "whitespace-nowrap transition-opacity",
            isSidebarOpen ? "opacity-100" : "opacity-0",
          )}
        >
          Darkroom
        </span>
      </a>
    </SidebarMenuButton>
  );
};
