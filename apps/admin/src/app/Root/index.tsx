import { AppSidebar } from "#components/Layout/AppSidebar/index";
import { Outlet } from "@tanstack/react-router";
import clsx from "clsx";
import { type FC } from "react";

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
