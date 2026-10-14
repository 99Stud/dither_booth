import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dither-booth/ui/components/ui/sheet";
import { NumberField } from "@dither-booth/ui/fields/NumberField";
import { SelectField } from "@dither-booth/ui/fields/SelectField";
import { TextField } from "@dither-booth/ui/fields/TextField";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import { useEffect } from "react";

import type { EventPrize, PrizeFormValues } from "../../Event.types";

import {
  DEFAULT_PRIZE_FORM_VALUES,
  PRIZE_FORM_SCHEMA,
  RARITY_FIELD_OPTIONS,
  getPrizeFormValues,
} from "../../Event.constants";

interface EventPrizeSheetProps {
  open: boolean;
  mode: "create" | "edit";
  prize: EventPrize | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PrizeFormValues) => Promise<void>;
}

export const EventPrizeSheet: FC<EventPrizeSheetProps> = (props) => {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={clsx("w-full sm:max-w-md")}>
        <SheetHeader>
          <SheetTitle>
            {mode === "create" ? "Add prize" : "Edit prize"}
          </SheetTitle>
          <SheetDescription>Weight controls relative odds.</SheetDescription>
        </SheetHeader>
        <form
          className={clsx("flex flex-1 flex-col gap-3 px-4")}
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
          <NumberField
            form={form}
            name="totalQuantity"
            label="Total quantity"
          />
          <NumberField
            form={form}
            name="remainingQuantity"
            label="Remaining quantity"
          />
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {mode === "create" ? "Add prize" : "Save prize"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
