import type { FC } from "react";

import { SidebarMenuButton } from "@dither-booth/ui/components/ui/sidebar";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";

import { useDarkroomHref } from "#lib/darkroom/useDarkroomHref";

/**
 * Print tuning lives in the Shutter's Darkroom, behind its PIN. The link
 * opens it in a new tab, at the Shutter origin the engine reports.
 */
export const DarkroomSidebarLink: FC = () => {
  const href = useDarkroomHref();

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
