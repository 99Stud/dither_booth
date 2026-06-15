import { Outlet } from "@tanstack/react-router";
import { type FC } from "react";

export const Root: FC = () => {
  return (
    <main data-dither-route-status="ready">
      <Outlet />
    </main>
  );
};
