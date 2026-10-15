import clsx from "clsx";

import { useDarkroomSession } from "#lib/darkroom/darkroom-token";

import { DarkroomHeader } from "./internal/components/DarkroomHeader";
import { DarkroomHealthStrip } from "./internal/components/DarkroomHealthStrip";
import { DarkroomUnlock } from "./internal/components/DarkroomUnlock";
import { SampleTicketsCard } from "./internal/components/SampleTicketsCard";
import { useDarkroomSessionGuard } from "./internal/hooks/useDarkroomSessionGuard";
import { PrintTuning } from "./internal/PrintTuning";

const DarkroomWorkspace = () => {
  useDarkroomSessionGuard();

  return (
    <div className={clsx("min-h-dvh bg-background text-foreground")}>
      <PrintTuning
        renderHeader={(tabs) => (
          <>
            <DarkroomHeader tabs={tabs} />
            <DarkroomHealthStrip />
          </>
        )}
      />
      <div className={clsx("p-2")}>
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
