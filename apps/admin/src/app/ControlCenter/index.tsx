import clsx from "clsx";

import { BoothScreenCard } from "#components/App/ControlCenter/BoothScreenCard/index";
import { HealthCard } from "#components/App/ControlCenter/HealthCard/index";
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

export const ControlCenter = () => {
  return (
    <>
      <AppSidebarPageHeader title="Control center" />
      <AppPageBody>
        <AppPageHeading title={`${getGreeting()} 👋`} />
        <div className={clsx("grid items-start gap-4 lg:grid-cols-2")}>
          <BoothScreenCard />
          <HealthCard />
        </div>
      </AppPageBody>
    </>
  );
};
