import { SidebarInset } from "@dither-booth/ui/components/ui/sidebar";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { Outlet } from "@tanstack/react-router";
import clsx from "clsx";
import { type FC } from "react";

import { AppSidebar } from "#components/Layout/AppSidebar/index";
import { AppTabBar } from "#components/Layout/AppTabBar/index";
import { StaffSignIn } from "#components/Layout/StaffSignIn/index";
import { useStaffSession } from "#lib/staff-session/useStaffSession";

export const Root: FC = () => {
  const { data: session, isError } = useStaffSession();

  if (!session?.signedIn) {
    return session || isError ? (
      // Engine unreachable: the screen still loads; signing in says why.
      <StaffSignIn pinSet={session?.pinSet ?? true} />
    ) : (
      <main
        className={clsx("flex min-h-dvh w-full items-center justify-center")}
      >
        <Spinner className="size-6" />
      </main>
    );
  }

  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
      <AppTabBar />
    </>
  );
};
