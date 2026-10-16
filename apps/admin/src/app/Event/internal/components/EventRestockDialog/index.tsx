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
import { createId } from "@paralleldrive/cuid2";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import { PackagePlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { EventPrize } from "../../Event.types";

import {
  DEFAULT_RESTOCK_PRIZE_FORM_VALUES,
  createRestockPrizeFormSchema,
} from "../../Event.constants";

export interface RestockPrizeSubmission {
  delta: number;
  /** Reused on retries of the same change, so it is applied once. */
  adjustmentId: string;
}

interface EventRestockDialogProps {
  open: boolean;
  prize: EventPrize | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: RestockPrizeSubmission) => Promise<void>;
}

export const EventRestockDialog: FC<EventRestockDialogProps> = (props) => {
  const { open, prize, isPending, onOpenChange, onSubmit } = props;
  const remaining = prize?.remainingQuantity ?? 0;

  // One id per change: a double submit or a retried request sends the same
  // id, so the engine applies the change once. A new change gets a new id.
  const [adjustmentId, setAdjustmentId] = useState(createId);

  const schema = useMemo(
    () => createRestockPrizeFormSchema(remaining),
    [remaining],
  );

  const form = useForm({
    defaultValues: DEFAULT_RESTOCK_PRIZE_FORM_VALUES,
    validators: {
      onChange: schema,
      onSubmit: schema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit({ delta: value.delta, adjustmentId });
      setAdjustmentId(createId());
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open || !prize) return;
    form.reset(DEFAULT_RESTOCK_PRIZE_FORM_VALUES);
    setAdjustmentId(createId());
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- reset on open/prize only
  }, [open, prize?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={clsx("sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle>Restock prize</DialogTitle>
          <DialogDescription>
            Add stock, or enter a negative number to remove some.
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
            name="delta"
            label="Change"
            // No inputmode: iOS then shows the numbers-and-punctuation
            // keyboard, which has the minus sign a removal needs.
            inputMode={undefined}
          />
          <form.Subscribe selector={(state) => state.values.delta}>
            {(delta) => (
              <p className={clsx("text-sm text-muted-foreground")}>
                {remaining} left
                {Number.isInteger(delta) && delta !== 0
                  ? ` → ${Math.max(remaining + delta, 0)} left`
                  : ""}
              </p>
            )}
          </form.Subscribe>
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
              <PackagePlus data-icon="inline-start" />
              Restock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
