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

import type { EventLot, LotFormValues } from "../../Event.types";

import {
  DEFAULT_LOT_FORM_VALUES,
  LOT_FORM_SCHEMA,
  RARITY_FIELD_OPTIONS,
  getLotFormValues,
} from "../../Event.constants";

interface EventLotSheetProps {
  open: boolean;
  mode: "create" | "edit";
  lot: EventLot | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: LotFormValues) => Promise<void>;
}

export const EventLotSheet: FC<EventLotSheetProps> = (props) => {
  const { open, mode, lot, isPending, onOpenChange, onSubmit } = props;

  const form = useForm({
    defaultValues:
      mode === "edit" && lot
        ? getLotFormValues(lot)
        : DEFAULT_LOT_FORM_VALUES,
    validators: {
      onChange: LOT_FORM_SCHEMA,
      onSubmit: LOT_FORM_SCHEMA,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      mode === "edit" && lot
        ? getLotFormValues(lot)
        : DEFAULT_LOT_FORM_VALUES,
    );
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- reset on open/lot only
  }, [open, mode, lot?.id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={clsx("w-full sm:max-w-md")}>
        <SheetHeader>
          <SheetTitle>{mode === "create" ? "Add lot" : "Edit lot"}</SheetTitle>
          <SheetDescription>
            Lots are prizes in the lottery table. Weight controls relative odds.
          </SheetDescription>
        </SheetHeader>
        <form
          className={clsx("flex flex-1 flex-col gap-3 px-4")}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <TextField
            form={form}
            name="winDescription"
            label="Win description"
          />
          <SelectField
            form={form}
            name="rarity"
            label="Rarity"
            placeholder="Select rarity"
            options={RARITY_FIELD_OPTIONS}
          />
          <NumberField form={form} name="weight" label="Weight" />
          <NumberField form={form} name="totalQuantity" label="Total quantity" />
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
              {mode === "create" ? "Add lot" : "Save lot"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
