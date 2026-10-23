import clsx from "clsx";

import { AppearanceCard } from "#components/App/Settings/AppearanceCard/index";
import { DarkroomPinCard } from "#components/App/Settings/DarkroomPinCard/index";
import { DocsCard } from "#components/App/Settings/DocsCard/index";
import { HubCard } from "#components/App/Settings/HubCard/index";
import { NetworkCard } from "#components/App/Settings/NetworkCard/index";
import { PrintingCard } from "#components/App/Settings/PrintingCard/index";
import {
  AppPageBody,
  AppPageHeading,
  AppSidebarPageHeader,
} from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";

/** What's set once, most needed first. The docs card is for phones, where the sidebar's link isn't. */
export const Settings = () => {
  return (
    <>
      <AppSidebarPageHeader title="Settings" />
      <AppPageBody>
        <AppPageHeading title="Settings" />
        <div className={clsx("grid items-start gap-4 lg:grid-cols-2")}>
          <NetworkCard />
          <div className={clsx("flex flex-col gap-4")}>
            <HubCard />
            <PrintingCard />
            <DarkroomPinCard />
            <AppearanceCard />
            <div className={clsx("md:hidden")}>
              <DocsCard />
            </div>
          </div>
        </div>
      </AppPageBody>
    </>
  );
};
