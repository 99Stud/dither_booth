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
import clsx from "clsx";

interface EventReplaceDialogProps {
  open: boolean;
  eventName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const EventReplaceDialog: FC<EventReplaceDialogProps> = (props) => {
  const { open, eventName, onOpenChange, onConfirm } = props;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Replace event?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes{" "}
            <span className={clsx("font-medium")}>{eventName}</span>, its
            lottery, lots, and draw history, then lets you create a new event.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
