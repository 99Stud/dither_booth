import { Outlet } from "@tanstack/react-router";
import clsx from "clsx";
import { type FC } from "react";

import { AppSidebar } from "#components/Layout/AppSidebar/index";

export const Root: FC = () => {
  return (
    <>
      <AppSidebar />
      <main className={clsx("flex-1")}>
        <Outlet />
      </main>
    </>
  );
};
