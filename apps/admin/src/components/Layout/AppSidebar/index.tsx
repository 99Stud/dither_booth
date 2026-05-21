import type { ComponentProps, FC } from "react";

import { DitherBoothLogo } from "@dither-booth/ui/components/svg/DitherBoothLogo/index";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@dither-booth/ui/components/ui/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import clsx from "clsx";

import { ROUTES_CONFIG } from "#lib/router/internal/router.constants";

import { APP_SIDEBAR_MENU_LINKS } from "./internal/AppSidebar.constants";

interface AppSidebarProps extends Omit<
  ComponentProps<typeof Sidebar>,
  "collapsible" | "children"
> {}

export const AppSidebar: FC<AppSidebarProps> = ({ ...props }) => {
  const { open } = useSidebar();

  const pathname = useLocation({
    select: (location) => location.pathname,
  });

  return (
    <Sidebar variant="floating" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link to={ROUTES_CONFIG.get("control-center")!.path}>
              <DitherBoothLogo
                className={clsx(
                  "h-7",
                  "pointer-events-none transition-opacity",
                  open ? "opacity-100 delay-200" : "opacity-0",
                )}
              />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {APP_SIDEBAR_MENU_LINKS.map((link) => (
              <SidebarMenuButton
                isActive={pathname === link.path}
                key={link.path}
                tooltip={link.label}
              >
                <Link
                  to={link.path}
                  className={clsx("w-full", "flex items-center gap-2")}
                >
                  {link.icon}
                  <span
                    className={clsx(
                      "whitespace-nowrap transition-opacity",
                      open ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {link.label}
                  </span>
                </Link>
                <div
                  className={clsx(
                    "size-1.5",
                    "rounded-full bg-primary transition-opacity delay-200",
                    pathname === link.path ? "opacity-100" : "opacity-0",
                  )}
                />
              </SidebarMenuButton>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
};
