import type { DrawOutcome, Rarity } from "@dither-booth/shared/lottery";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";

import { useTRPC } from "#lib/trpc/trpc.client";

import { reportPrintConfigurationError } from "../../PrintTuning/internal/PrintConfiguration.utils";

type SamplePrize = { id: string; title: string; rarity: Rarity };

const NO_PRIZES: SamplePrize[] = [];

/**
 * Prints sample win and lose tickets with the current event's prizes, moved
 * from admin's Event page. Nothing is drawn and prize stock stays the same.
 */
export const SampleTicketsCard: FC = () => {
  const trpc = useTRPC();
  const { data: currentEvent } = useQuery(
    trpc.config.getCurrentEvent.queryOptions(),
  );
  const prizes = currentEvent?.prizes ?? NO_PRIZES;
  const {
    mutateAsync: printSampleLotteryTicket,
    isPending: isPrinting,
    variables,
  } = useMutation(trpc.config.printSampleLotteryTicket.mutationOptions());
  const printingOutcome: DrawOutcome | null = isPrinting
    ? (variables?.outcome ?? null)
    : null;
  const onPrint = async (input: { outcome: DrawOutcome; prizeId?: string }) => {
    await printSampleLotteryTicket(input).catch((error: unknown) => {
      reportPrintConfigurationError(
        error,
        "print-sample-ticket-failed",
        "Failed to print the sample ticket.",
      );
    });
  };
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
        <CardTitle>Sample tickets</CardTitle>
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
            {currentEvent === null
              ? "No event is set up yet. Create one in admin to print a win ticket."
              : "Add a prize in admin to print a win ticket."}
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
