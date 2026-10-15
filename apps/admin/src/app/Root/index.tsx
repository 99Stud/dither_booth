import { SidebarInset } from "@dither-booth/ui/components/ui/sidebar";
import { Outlet } from "@tanstack/react-router";
import { type FC } from "react";

import { AppSidebar } from "#components/Layout/AppSidebar/index";

export const Root: FC = () => {
  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </>
  );
};
