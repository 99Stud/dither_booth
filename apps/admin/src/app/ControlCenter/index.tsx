import clsx from "clsx";

import { BoothCameraCard } from "#components/App/ControlCenter/BoothCameraCard/index";
import { BoothScreenCard } from "#components/App/ControlCenter/BoothScreenCard/index";
import { HealthCard } from "#components/App/ControlCenter/HealthCard/index";
import { NetworkCard } from "#components/App/ControlCenter/NetworkCard/index";
import { PrinterCard } from "#components/App/ControlCenter/PrinterCard/index";
import {
  AppPageBody,
  AppPageHeading,
  AppSidebarPageHeader,
} from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";

const getGreeting = (hour = new Date().getHours()) =>
  hour < 5
    ? "Late night"
    : hour < 12
      ? "Good morning"
      : hour < 18
        ? "Good afternoon"
        : "Good evening";

/** In the order staff use it: act (screen, printer), find out why (camera, health), connect a device. */
export const ControlCenter = () => {
  return (
    <>
      <AppSidebarPageHeader title="Control center" />
      <AppPageBody>
        <AppPageHeading title={`${getGreeting()} 👋`} />
        <div className={clsx("grid items-start gap-4 lg:grid-cols-2")}>
          <BoothScreenCard />
          <PrinterCard />
          <BoothCameraCard />
          <HealthCard />
          <div className={clsx("lg:col-span-2")}>
            <NetworkCard />
          </div>
        </div>
      </AppPageBody>
    </>
  );
};
