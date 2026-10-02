import type { DrawOutcome } from "@dither-booth/shared/lottery";
import type { FC } from "react";

import { capitalize } from "@dither-booth/shared/formatting";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Field, FieldLabel } from "@dither-booth/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dither-booth/ui/components/ui/select";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { useState } from "react";

import type { EventPrize } from "../../Event.types";

export const EventTicketPreview: FC<{
  isPrinting: boolean;
  printingOutcome: DrawOutcome | null;
  prizes: EventPrize[];
  onPrint: (input: { outcome: DrawOutcome; prizeId?: string }) => Promise<void>;
}> = (props) => {
  const { isPrinting, onPrint, printingOutcome, prizes } = props;
  const [prizeId, setPrizeId] = useState<string | null>(null);
  const selectedPrizeId =
    prizes.find((prize) => prize.id === prizeId)?.id ?? prizes[0]?.id ?? null;
  const prizeOptions = prizes.map((prize) => ({
    label: `${prize.title} · ${capitalize(prize.rarity)}`,
    value: prize.id,
  }));

  return (
    <Card className={clsx("max-w-xl")}>
      <CardHeader>
        <CardTitle>Ticket preview</CardTitle>
        <CardDescription>
          Print a sample win or lose ticket to check the layout. The draw is not
          recorded and prize stock stays the same.
        </CardDescription>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-3")}>
        {selectedPrizeId ? (
          <Field>
            <FieldLabel htmlFor="sample-win-prize">Win prize</FieldLabel>
            <Select
              items={prizeOptions}
              value={selectedPrizeId}
              onValueChange={(value) => {
                if (typeof value !== "string") return;
                setPrizeId(value);
              }}
            >
              <SelectTrigger
                id="sample-win-prize"
                className={clsx("w-full")}
                disabled={isPrinting}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {prizeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <p className={clsx("text-sm text-muted-foreground")}>
            Add a prize to preview a win ticket.
          </p>
        )}
        <div className={clsx("flex flex-wrap gap-2")}>
          <Button
            type="button"
            variant="outline"
            disabled={isPrinting}
            onClick={() => {
              void onPrint({ outcome: "loss" });
            }}
          >
            {printingOutcome === "loss" ? (
              <>
                Printing lose ticket&nbsp;
                <Spinner className="size-4" />
              </>
            ) : (
              "Print lose ticket"
            )}
          </Button>
          <Button
            type="button"
            disabled={isPrinting || !selectedPrizeId}
            onClick={() => {
              if (!selectedPrizeId) return;
              void onPrint({ outcome: "win", prizeId: selectedPrizeId });
            }}
          >
            {printingOutcome === "win" ? (
              <>
                Printing win ticket&nbsp;
                <Spinner className="size-4" />
              </>
            ) : (
              "Print win ticket"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
