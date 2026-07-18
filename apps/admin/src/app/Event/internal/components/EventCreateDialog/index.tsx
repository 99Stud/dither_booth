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
import { NumberField } from "@dither-booth/ui/fields/NumberField";
import { SwitchField } from "@dither-booth/ui/fields/SwitchField";
import { TextField } from "@dither-booth/ui/fields/TextField";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";

import type { CreateEventFormValues } from "../../Event.types";

import {
  CREATE_EVENT_FORM_SCHEMA,
  DEFAULT_CREATE_EVENT_FORM_VALUES,
} from "../../Event.constants";

interface EventCreateDialogProps {
  open: boolean;
  isPending: boolean;
  title?: string;
  description?: string;
  submitLabel?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateEventFormValues) => Promise<void>;
}

export const EventCreateDialog: FC<EventCreateDialogProps> = (props) => {
  const {
    open,
    isPending,
    title = "Create event",
    description = "Sets up the campaign and its lottery. You can add lots next.",
    submitLabel = "Create event",
    onOpenChange,
    onSubmit,
  } = props;

  const form = useForm({
    defaultValues: DEFAULT_CREATE_EVENT_FORM_VALUES,
    validators: {
      onChange: CREATE_EVENT_FORM_SCHEMA,
      onSubmit: CREATE_EVENT_FORM_SCHEMA,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
      form.reset();
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          form.reset();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className={clsx("sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className={clsx("flex flex-col gap-3")}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <TextField form={form} name="name" label="Event name" />
          <NumberField form={form} name="noWinWeight" label="No-win weight" />
          <NumberField
            form={form}
            name="winCooldownMinutes"
            label="Win cooldown (minutes)"
          />
          <SwitchField form={form} name="enabled" label="Enable lottery now" />
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
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
