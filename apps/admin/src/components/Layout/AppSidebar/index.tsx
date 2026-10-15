import type { ComponentProps, FC } from "react";

import {
  isThemePreference,
  ThemeToggle,
} from "@dither-booth/ui/components/misc/ThemeToggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@dither-booth/ui/components/ui/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import clsx from "clsx";
import { Aperture } from "lucide-react";
import { useTheme } from "next-themes";

import { ROUTES_CONFIG } from "#lib/router/internal/router.constants";

import { APP_SIDEBAR_MENU_LINKS } from "./internal/AppSidebar.constants";
import { DarkroomSidebarLink } from "./internal/components/DarkroomSidebarLink";

interface AppSidebarProps extends Omit<
  ComponentProps<typeof Sidebar>,
  "collapsible" | "children" | "variant"
> {}

/**
 * The admin's navigation, in the inset layout of Vercel's and Linear's
 * dashboards: the sidebar sits on the tinted background, the page in a
 * rounded panel next to it. Collapses to icons on desktop and turns into a
 * slide-over sheet on phones.
 */
export const AppSidebar: FC<AppSidebarProps> = ({ ...props }) => {
  const { isMobile, setOpenMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  // On a phone, following a link should close the sheet it was tapped in.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu className={clsx("gap-1")}>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={
                <Link
                  to={ROUTES_CONFIG.get("control-center")!.path}
                  onClick={closeOnMobile}
                />
              }
            >
              <span
                className={clsx(
                  "flex aspect-square size-8 items-center justify-center",
                  "rounded-lg bg-sidebar-primary text-sidebar-primary-foreground",
                )}
              >
                <Aperture className="size-4" />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">
                  Dither Booth
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  Booth admin
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Booth</SidebarGroupLabel>
          <SidebarMenu className={clsx("gap-1")}>
            {APP_SIDEBAR_MENU_LINKS.map((link) => (
              <SidebarMenuItem key={link.path}>
                <SidebarMenuButton
                  className={clsx("h-9")}
                  isActive={pathname === link.path}
                  tooltip={link.label}
                  render={<Link to={link.path} onClick={closeOnMobile} />}
                >
                  {link.icon}
                  <span>{link.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>On the booth</SidebarGroupLabel>
          <SidebarMenu className={clsx("gap-1")}>
            <SidebarMenuItem>
              <DarkroomSidebarLink />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div
          className={clsx(
            "flex items-center justify-between gap-2 px-2 py-1",
            "group-data-[collapsible=icon]:hidden",
          )}
        >
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeToggle
            value={isThemePreference(theme) ? theme : "system"}
            onValueChange={setTheme}
          />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
