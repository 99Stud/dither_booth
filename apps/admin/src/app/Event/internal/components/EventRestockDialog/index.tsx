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
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import { useEffect } from "react";

import type { EventPrize, RestockPrizeFormValues } from "../../Event.types";

import {
  RESTOCK_PRIZE_FORM_SCHEMA,
  getRestockPrizeFormValues,
} from "../../Event.constants";

interface EventRestockDialogProps {
  open: boolean;
  prize: EventPrize | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: RestockPrizeFormValues) => Promise<void>;
}

export const EventRestockDialog: FC<EventRestockDialogProps> = (props) => {
  const { open, prize, isPending, onOpenChange, onSubmit } = props;

  const form = useForm({
    defaultValues: prize
      ? getRestockPrizeFormValues(prize)
      : { remainingQuantity: 0, totalQuantity: 0 },
    validators: {
      onChange: RESTOCK_PRIZE_FORM_SCHEMA,
      onSubmit: RESTOCK_PRIZE_FORM_SCHEMA,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open || !prize) return;
    form.reset(getRestockPrizeFormValues(prize));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- reset on open/prize only
  }, [open, prize?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={clsx("sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle>Restock prize</DialogTitle>
          <DialogDescription>
            Set remaining stock. Total increases automatically if remaining goes
            above the previous total.
          </DialogDescription>
        </DialogHeader>
        <form
          className={clsx("flex flex-col gap-3")}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <NumberField
            form={form}
            name="remainingQuantity"
            label="Remaining quantity"
          />
          <NumberField
            form={form}
            name="totalQuantity"
            label="Total quantity"
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
            <Button type="submit" disabled={isPending || !prize}>
              Restock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
