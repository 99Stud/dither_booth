import type { ComponentProps, FC } from "react";

import { DitherBoothMark } from "@dither-booth/ui/components/svg/DitherBoothMark/index";
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

import { ROUTES_CONFIG } from "#lib/router/internal/router.constants";

import {
  APP_DOCS_LINK,
  APP_LOGS_LINK,
  APP_SETTINGS_LINK,
  APP_SIDEBAR_MENU_LINKS,
} from "./internal/AppSidebar.constants";

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
                <DitherBoothMark className="h-5" />
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
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className={clsx("h-9")}
              tooltip={APP_DOCS_LINK.label}
              render={
                <a
                  href={APP_DOCS_LINK.href}
                  target="_blank"
                  rel="noopener"
                  onClick={closeOnMobile}
                />
              }
            >
              {APP_DOCS_LINK.icon}
              <span>{APP_DOCS_LINK.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              className={clsx("h-9")}
              isActive={pathname === APP_LOGS_LINK.path}
              tooltip={APP_LOGS_LINK.label}
              render={<Link to={APP_LOGS_LINK.path} onClick={closeOnMobile} />}
            >
              {APP_LOGS_LINK.icon}
              <span>{APP_LOGS_LINK.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              className={clsx("h-9")}
              isActive={pathname === APP_SETTINGS_LINK.path}
              tooltip={APP_SETTINGS_LINK.label}
              render={
                <Link to={APP_SETTINGS_LINK.path} onClick={closeOnMobile} />
              }
            >
              {APP_SETTINGS_LINK.icon}
              <span>{APP_SETTINGS_LINK.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
