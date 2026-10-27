import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dither-booth/ui/components/ui/dialog";
import { DateTimeField } from "@dither-booth/ui/fields/DateTimeField";
import { TextField } from "@dither-booth/ui/fields/TextField";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";

import type { CurrentEvent, UpdateEventFormValues } from "../../Event.types";

import {
  UPDATE_EVENT_FORM_SCHEMA,
  getUpdateEventFormValues,
} from "../../Event.constants";

interface EventDetailsDialogProps {
  event: CurrentEvent;
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: UpdateEventFormValues) => Promise<void>;
}

/** The event's name, start and end: an edit, not a replacement. */
export const EventDetailsDialog: FC<EventDetailsDialogProps> = (props) => {
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
        // Opens on the details as stored, not on an abandoned edit.
        if (nextOpen) form.reset(getUpdateEventFormValues(event));
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className={clsx("sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle>Event details</DialogTitle>
          <DialogDescription>
            Only visits between the start and the end count in the Overview.
            Leave a side empty to keep it open.
          </DialogDescription>
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
            enterKeyHint="next"
          />
          <DateTimeField
            form={form}
            name="startsAt"
            label="Starts"
            defaultTime="18:00"
          />
          <DateTimeField
            form={form}
            name="endsAt"
            label="Ends"
            defaultTime="23:00"
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
