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
import { SelectField } from "@dither-booth/ui/fields/SelectField";
import { TextField } from "@dither-booth/ui/fields/TextField";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import { Plus, Save } from "lucide-react";
import { useEffect } from "react";

import type { EventPrize, PrizeFormValues } from "../../Event.types";

import {
  DEFAULT_PRIZE_FORM_VALUES,
  PRIZE_FORM_SCHEMA,
  RARITY_FIELD_OPTIONS,
  getPrizeFormValues,
} from "../../Event.constants";

interface EventPrizeDialogProps {
  open: boolean;
  mode: "create" | "edit";
  prize: EventPrize | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PrizeFormValues) => Promise<void>;
}

export const EventPrizeDialog: FC<EventPrizeDialogProps> = (props) => {
  const { open, mode, prize, isPending, onOpenChange, onSubmit } = props;

  const form = useForm({
    defaultValues:
      mode === "edit" && prize
        ? getPrizeFormValues(prize)
        : DEFAULT_PRIZE_FORM_VALUES,
    validators: {
      onChange: PRIZE_FORM_SCHEMA,
      onSubmit: PRIZE_FORM_SCHEMA,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      mode === "edit" && prize
        ? getPrizeFormValues(prize)
        : DEFAULT_PRIZE_FORM_VALUES,
    );
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- reset on open/prize only
  }, [open, mode, prize?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={clsx("sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add prize" : "Edit prize"}
          </DialogTitle>
          <DialogDescription>Weight controls relative odds.</DialogDescription>
        </DialogHeader>
        <form
          className={clsx("flex flex-col gap-3")}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <TextField form={form} name="title" label="Title" />
          <TextField
            form={form}
            name="winInstruction"
            label="Win instruction"
          />
          <SelectField
            form={form}
            name="rarity"
            label="Rarity"
            placeholder="Select rarity"
            options={RARITY_FIELD_OPTIONS}
          />
          <NumberField form={form} name="weight" label="Weight" />
          {mode === "create" ? (
            <NumberField form={form} name="quantity" label="Quantity" />
          ) : prize ? (
            // Stock only moves through restock deltas, so an edit can never
            // overwrite wins that happened while the dialog was open.
            <p className={clsx("text-sm text-muted-foreground")}>
              {prize.remainingQuantity} left of {prize.totalQuantity}. Use
              Restock to change the stock.
            </p>
          ) : null}
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
              {mode === "create" ? (
                <Plus data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              {mode === "create" ? "Add prize" : "Save prize"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
