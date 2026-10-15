import type { FC } from "react";

import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { SidebarMenuButton } from "@dither-booth/ui/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";

import { useTRPC } from "#lib/trpc/trpc.client";

/**
 * Print tuning lives in the Shutter's Darkroom, behind its PIN. The link
 * opens it in a new tab, at the Shutter origin the engine reports.
 */
export const DarkroomSidebarLink: FC = () => {
  const trpc = useTRPC();
  const { data: healthz } = useQuery(
    trpc.ops.getHealthz.queryOptions(undefined, { staleTime: Infinity }),
  );
  const href = healthz
    ? new URL(DARKROOM_PATH, healthz.shutter.origin).toString()
    : undefined;

  return (
    <SidebarMenuButton
      className="h-9"
      disabled={!href}
      tooltip="Darkroom (print tuning)"
      render={<a href={href} rel="noreferrer" target="_blank" />}
    >
      <SlidersHorizontal />
      <span>Darkroom</span>
      <ArrowUpRight className="ml-auto text-muted-foreground" />
    </SidebarMenuButton>
  );
};
