import clsx from "clsx";

import { DarkroomPinCard } from "#components/App/ControlCenter/DarkroomPinCard/index";
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
        <AppPageHeading
          title={`${getGreeting()} 👋`}
          description="Here's how the booth is doing."
        />
        <div className={clsx("grid items-start gap-4 lg:grid-cols-2")}>
          <HealthCard />
          <DarkroomPinCard />
        </div>
      </AppPageBody>
    </>
  );
};
