import type { KioskReloadMode } from "@dither-booth/shared/kiosk";
import type { FC } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@dither-booth/ui/components/ui/alert-dialog";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { format } from "date-fns";

import type { HealthzResponse } from "#components/App/ControlCenter/HealthCard/internal/HealthCard.types";

import { HealthDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthDetailRow/index";

interface KioskReloadSectionProps {
  pages: HealthzResponse["shutter"]["kiosk"]["pages"];
  isReloading: boolean;
  onReload: (mode: KioskReloadMode) => void;
}

/**
 * The kiosk pages connected to the engine's kiosk channel, and the button
 * that asks them to reload: when idle (after the current visit) or now.
 */
export const KioskReloadSection: FC<KioskReloadSectionProps> = ({
  pages,
  isReloading,
  onReload,
}) => {
  return (
    <>
      <HealthDetailRow label="kiosk pages">
        {pages.length === 0
          ? "none connected"
          : `${pages.length} connected (since ${pages
              .map((page) => format(new Date(page.connectedAt), "HH:mm:ss"))
              .join(", ")})`}
      </HealthDetailRow>
      <div className={clsx("text-right")}>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button size="sm" variant="outline" disabled={isReloading}>
                {isReloading ? (
                  <>
                    Reloading kiosk&nbsp;
                    <Spinner className="size-4" />
                  </>
                ) : (
                  "Reload kiosk"
                )}
              </Button>
            }
          />
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Reload the kiosk page?</AlertDialogTitle>
              <AlertDialogDescription>
                Reload when idle waits for the current visit to end (90 s at
                most). Reload now reloads straight away, even in the middle of a
                visit.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="outline"
                onClick={() => onReload("now")}
              >
                Reload now
              </AlertDialogAction>
              <AlertDialogAction onClick={() => onReload("when-idle")}>
                Reload when idle
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
};
