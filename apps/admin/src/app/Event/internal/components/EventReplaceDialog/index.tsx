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
            This archives{" "}
            <span className={clsx("font-medium")}>{eventName}</span>, then lets
            you create a new event. Its lottery, prizes and draws are kept on
            record but no longer used on this booth.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
