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

/**
 * Read top to bottom, as staff use it at an event: what guests see and
 * whether it prints (the two things to act on), then the camera and the
 * health checks to find out why, then the way another device gets in. Rows
 * share their height; the network card has the full width its QR and
 * addresses need.
 */
export const ControlCenter = () => {
  return (
    <>
      <AppSidebarPageHeader title="Control center" />
      <AppPageBody>
        <AppPageHeading title={`${getGreeting()} 👋`} />
        <div className={clsx("grid gap-4 lg:grid-cols-2")}>
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
