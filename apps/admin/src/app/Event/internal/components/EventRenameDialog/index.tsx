import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dither-booth/ui/components/ui/dialog";
import { TextField } from "@dither-booth/ui/fields/TextField";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";

import type { CurrentEvent, UpdateEventFormValues } from "../../Event.types";

import {
  UPDATE_EVENT_FORM_SCHEMA,
  getUpdateEventFormValues,
} from "../../Event.constants";

interface EventRenameDialogProps {
  event: CurrentEvent;
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: UpdateEventFormValues) => Promise<void>;
}

/** Renames the event: an edit, not a replacement. */
export const EventRenameDialog: FC<EventRenameDialogProps> = (props) => {
  const { event, open, isPending, onOpenChange, onSubmit } = props;

  const form = useForm({
    defaultValues: getUpdateEventFormValues(event),
    validators: {
      onChange: UPDATE_EVENT_FORM_SCHEMA,
      onSubmit: UPDATE_EVENT_FORM_SCHEMA,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Opens on the name as stored, not on an abandoned edit.
        if (nextOpen) form.reset(getUpdateEventFormValues(event));
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className={clsx("sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle>Rename event</DialogTitle>
        </DialogHeader>
        <form
          className={clsx("flex flex-col gap-3")}
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            submitEvent.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <TextField
            form={form}
            name="name"
            label="Event name"
            autoCapitalize="words"
            enterKeyHint="done"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
