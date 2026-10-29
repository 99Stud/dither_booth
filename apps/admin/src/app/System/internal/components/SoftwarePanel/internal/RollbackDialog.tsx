import type { BoothRollbackTarget } from "@dither-booth/shared/booth-update";
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
} from "@dither-booth/ui/components/ui/alert-dialog";

import { formatAgo } from "#lib/update/update.utils";

/**
 * Confirms going back to the release before the last update. Across a
 * migration it restores the database copy taken before that update, and
 * says what is lost.
 */
export const RollbackDialog: FC<{
  open: boolean;
  release: string;
  previous: NonNullable<BoothRollbackTarget>;
  onCancel: () => void;
  onConfirm: (restoreDb: boolean) => void;
}> = ({ open, release, previous, onCancel, onConfirm }) => (
  <AlertDialog
    open={open}
    onOpenChange={(next) => {
      if (!next) onCancel();
    }}
  >
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Go back to {previous.release}?</AlertDialogTitle>
        <AlertDialogDescription>
          {previous.migrated
            ? `${release} changed the database, so going back restores the copy taken${previous.backupTakenAt ? ` ${formatAgo(previous.backupTakenAt)}` : " before that update"}. Visits and draws since then are lost.`
            : "The booth restarts on the release it ran before. The database stays as it is."}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant={previous.migrated ? "destructive" : "default"}
          onClick={() => onConfirm(previous.migrated)}
        >
          {previous.migrated ? "Roll back and restore" : "Roll back"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
