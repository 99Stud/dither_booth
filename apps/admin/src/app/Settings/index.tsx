import clsx from "clsx";

import { AppearanceCard } from "#components/App/Settings/AppearanceCard/index";
import { DarkroomPinCard } from "#components/App/Settings/DarkroomPinCard/index";
import {
  AppPageBody,
  AppPageHeading,
  AppSidebarPageHeader,
} from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";

/** The admin's settings: this device's look, and the booth's access. */
export const Settings = () => {
  return (
    <>
      <AppSidebarPageHeader title="Settings" />
      <AppPageBody>
        <AppPageHeading title="Settings" />
        <div className={clsx("grid items-start gap-4 lg:grid-cols-2")}>
          <AppearanceCard />
          <DarkroomPinCard />
        </div>
      </AppPageBody>
    </>
  );
};
