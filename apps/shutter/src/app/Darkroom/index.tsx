import { watchVirtualKeyboard } from "@dither-booth/ui/virtual-keyboard";
import clsx from "clsx";
import { useEffect } from "react";

import { useDarkroomSession } from "#lib/darkroom/darkroom-token";

import { DarkroomHeader } from "./internal/components/DarkroomHeader";
import { DarkroomHealthStrip } from "./internal/components/DarkroomHealthStrip";
import { DarkroomUnlock } from "./internal/components/DarkroomUnlock";
import { SampleTicketsCard } from "./internal/components/SampleTicketsCard";
import { useDarkroomSessionGuard } from "./internal/hooks/useDarkroomSessionGuard";
import { PrintTuning } from "./internal/PrintTuning";

const DarkroomWorkspace = () => {
  useDarkroomSessionGuard();
  // Print tuning has number fields: keep them clear of the iPad keyboard.
  useEffect(() => watchVirtualKeyboard(), []);

  return (
    <div className={clsx("min-h-dvh bg-background text-foreground")}>
      <PrintTuning
        renderHeader={(tabs) => (
          <>
            <DarkroomHeader tabs={tabs} />
            <div className={clsx("px-4 pt-4 lg:px-6")}>
              <DarkroomHealthStrip />
            </div>
          </>
        )}
      />
      <div className={clsx("px-4 pb-6 lg:px-6")}>
        <SampleTicketsCard />
      </div>
    </div>
  );
};

/**
 * Print tuning on the booth iPad, behind the Darkroom PIN. Opened with a
 * 4 quick taps on the landing screen's top-left logo, or at /darkroom.
 */
export const Darkroom = () => {
  const session = useDarkroomSession();

  return session ? <DarkroomWorkspace /> : <DarkroomUnlock />;
};
