import clsx from "clsx";

import { DarkroomPinCard } from "#components/App/ControlCenter/DarkroomPinCard/index";
import { HealthCard } from "#components/App/ControlCenter/HealthCard/index";
import { AppSidebarPageHeader } from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";

export const ControlCenter = () => {
  return (
    <>
      <AppSidebarPageHeader title="Control center" />
      <div className={clsx("pr-2", "grid grid-cols-2 items-start gap-2")}>
        <HealthCard />
        <DarkroomPinCard />
      </div>
    </>
  );
};
