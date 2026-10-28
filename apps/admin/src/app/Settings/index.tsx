import clsx from "clsx";

import { AppearanceCard } from "#components/App/Settings/AppearanceCard/index";
import { DarkroomPinCard } from "#components/App/Settings/DarkroomPinCard/index";
import { DocsCard } from "#components/App/Settings/DocsCard/index";
import { HubCard } from "#components/App/Settings/HubCard/index";
import { LogsCard } from "#components/App/Settings/LogsCard/index";
import { NetworkCard } from "#components/App/Settings/NetworkCard/index";
import { PrintingCard } from "#components/App/Settings/PrintingCard/index";
import { SystemCard } from "#components/App/Settings/SystemCard/index";
import {
  AppPageBody,
  AppPageHeading,
  AppSidebarPageHeader,
} from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";

/**
 * What's set once, most needed first: the booth's hardware on the left, access
 * and display on the right, so neither column is empty whatever the Wi-Fi
 * card's height. The docs, logs and system cards are for phones, where the
 * sidebar's links aren't.
 */
export const Settings = () => {
  return (
    <>
      <AppSidebarPageHeader title="Settings" />
      <AppPageBody>
        <AppPageHeading title="Settings" />
        <div className={clsx("grid items-start gap-4 lg:grid-cols-2")}>
          <div className={clsx("flex flex-col gap-4")}>
            <NetworkCard />
            <PrintingCard />
          </div>
          <div className={clsx("flex flex-col gap-4")}>
            <HubCard />
            <DarkroomPinCard />
            <AppearanceCard />
            <div className={clsx("flex flex-col gap-4 md:hidden")}>
              <DocsCard />
              <LogsCard />
              <SystemCard />
            </div>
          </div>
        </div>
      </AppPageBody>
    </>
  );
};
