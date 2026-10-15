import clsx from "clsx";

import { DarkroomPinCard } from "#components/App/ControlCenter/DarkroomPinCard/index";
import { HealthCard } from "#components/App/ControlCenter/HealthCard/index";
import {
  AppPageBody,
  AppPageHeading,
  AppSidebarPageHeader,
} from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";

export const ControlCenter = () => {
  return (
    <>
      <AppSidebarPageHeader title="Control center" />
      <AppPageBody>
        <AppPageHeading title="Control center" />
        <div className={clsx("grid items-start gap-4 lg:grid-cols-2")}>
          <HealthCard />
          <DarkroomPinCard />
        </div>
      </AppPageBody>
    </>
  );
};
