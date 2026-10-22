import clsx from "clsx";

import { AppearanceCard } from "#components/App/Settings/AppearanceCard/index";
import { DarkroomPinCard } from "#components/App/Settings/DarkroomPinCard/index";
import { DocsCard } from "#components/App/Settings/DocsCard/index";
import { HubCard } from "#components/App/Settings/HubCard/index";
import { NetworkCard } from "#components/App/Settings/NetworkCard/index";
import {
  AppPageBody,
  AppPageHeading,
  AppSidebarPageHeader,
} from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";

/**
 * What's set once, most often needed first: the booth's Wi-Fi (every venue),
 * its Hub registration (once per booth), the Darkroom PIN, then this device's
 * look. The docs card only shows on a phone, where the sidebar's link isn't.
 * Two balanced columns, in that order: the Wi-Fi card is tall on a booth and
 * short where the machine manages its own Wi-Fi.
 */
export const Settings = () => {
  return (
    <>
      <AppSidebarPageHeader title="Settings" />
      <AppPageBody>
        <AppPageHeading title="Settings" />
        <div
          className={clsx(
            "flex flex-col gap-4",
            "lg:block lg:columns-2 lg:gap-4 lg:*:mb-4 lg:*:break-inside-avoid",
          )}
        >
          <NetworkCard />
          <HubCard />
          <DarkroomPinCard />
          <AppearanceCard />
          <div className={clsx("md:hidden")}>
            <DocsCard />
          </div>
        </div>
      </AppPageBody>
    </>
  );
};
