import type { DrawOutcome, Rarity } from "@dither-booth/shared/lottery";
import type { FC } from "react";

import { capitalize } from "@dither-booth/shared/formatting";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
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
import { haptic } from "@dither-booth/ui/haptics";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Frown, Ticket, Trophy } from "lucide-react";
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
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="amber">
            <Ticket />
          </IconBubble>
          Sample tickets
        </CardTitle>
        <CardDescription>
          Check the lottery ticket on paper. Nothing is drawn.
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
        <div className={clsx("flex flex-wrap justify-end gap-2")}>
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={isPrinting}
            onClick={() => {
              haptic("medium");
              void onPrint({ outcome: "loss" });
            }}
          >
            {printingOutcome === "loss" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Frown data-icon="inline-start" />
            )}
            Lose ticket
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={isPrinting || !selectedPrizeId}
            onClick={() => {
              if (!selectedPrizeId) return;
              haptic("medium");
              void onPrint({ outcome: "win", prizeId: selectedPrizeId });
            }}
          >
            {printingOutcome === "win" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Trophy data-icon="inline-start" />
            )}
            Win ticket
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
