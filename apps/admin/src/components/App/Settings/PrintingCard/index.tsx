import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Separator } from "@dither-booth/ui/components/ui/separator";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@dither-booth/ui/components/ui/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Printer } from "lucide-react";

import { SETTINGS_LOG_SOURCE } from "#app/Settings/internal/Settings.constants";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

type LeadingEnd = "bottom" | "top";

/** Bottom first is `print_config.upside_down`: the ticket printed turned. */
const LEADING_END_OPTIONS = [
  { value: "bottom", label: "Bottom first" },
  { value: "top", label: "Top first" },
] as const satisfies ReadonlyArray<{ label: string; value: LeadingEnd }>;

const isLeadingEnd = (value: unknown): value is LeadingEnd =>
  value === "bottom" || value === "top";

/**
 * An upright ticket (photo, then text) with an arrow out of the end that
 * leaves the printer first.
 */
const TicketGlyph = ({ leadingEnd }: { leadingEnd: LeadingEnd }) => (
  <svg
    aria-hidden
    className={clsx("size-12")}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.5}
    viewBox="0 0 32 48"
  >
    <rect height={28} rx={2} width={18} x={7} y={10} />
    <rect
      fill="currentColor"
      fillOpacity={0.25}
      height={9}
      rx={1}
      width={12}
      x={10}
      y={13}
    />
    <path d="M10 26h12M10 29.5h12M10 33h7" />
    {leadingEnd === "top" ? (
      <path d="M16 8V2M13 5l3-3 3 3" />
    ) : (
      <path d="M16 40v6M13 43l3 3 3-3" />
    )}
  </svg>
);

/**
 * Which end of the photo receipt and the lottery ticket leaves the printer
 * first, as two pictured choices, and a test print to check it on paper.
 */
export const PrintingCard = () => {
  const trpc = useTRPC();
  const printConfigurationQuery = useQuery(
    trpc.config.getPrintConfiguration.queryOptions(),
  );
  const upsideDownMutation = useMutation(
    trpc.config.updatePrintConfiguration.mutationOptions(),
  );
  const testPrintMutation = useMutation(
    trpc.config.printSampleLotteryTicket.mutationOptions(),
  );
  const printConfiguration = printConfigurationQuery.data;
  const isUpsideDown = upsideDownMutation.isPending
    ? upsideDownMutation.variables.upsideDown
    : (printConfiguration?.upsideDown ?? true);
  const leadingEnd: LeadingEnd = isUpsideDown ? "bottom" : "top";

  const setLeadingEnd = async (next: LeadingEnd) => {
    const upsideDown = next === "bottom";
    const saved = await upsideDownMutation
      .mutateAsync({ upsideDown })
      .then(() => true)
      .catch((error: unknown) => {
        reportKioskError(error, {
          event: "settings-upside-down-failed",
          source: SETTINGS_LOG_SOURCE,
          userMessage: "Couldn't change which end comes out first.",
        });
        return false;
      });

    await printConfigurationQuery.refetch();
    if (saved) {
      notify.success(
        upsideDown
          ? "Tickets now come out bottom first."
          : "Tickets now come out top first.",
      );
    }
  };

  const printTestTicket = async () => {
    const printed = await testPrintMutation
      .mutateAsync({ outcome: "loss" })
      .then(() => true)
      .catch((error: unknown) => {
        reportKioskError(error, {
          event: "settings-test-ticket-failed",
          source: SETTINGS_LOG_SOURCE,
          userMessage: "Couldn't print a test ticket.",
        });
        return false;
      });

    if (printed) notify.success("Test ticket sent to the printer.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="amber">
            <Printer />
          </IconBubble>
          <h2>Printing</h2>
        </CardTitle>
        <CardDescription>
          Which end of the ticket comes out of the printer first.
        </CardDescription>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-4")}>
        <ToggleGroup
          aria-label="Which end of the ticket comes out first"
          className={clsx("grid w-full grid-cols-2")}
          disabled={!printConfiguration || upsideDownMutation.isPending}
          spacing={2}
          variant="outline"
          value={[leadingEnd]}
          onValueChange={(next: unknown[]) => {
            const [selected] = next;
            if (isLeadingEnd(selected) && selected !== leadingEnd) {
              void setLeadingEnd(selected);
            }
          }}
        >
          {LEADING_END_OPTIONS.map(({ label, value }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className={clsx(
                "h-auto flex-col gap-1 rounded-xl py-3 text-sm",
                "data-[pressed]:border-primary data-[pressed]:bg-primary/5",
                "data-[pressed]:text-primary",
              )}
            >
              <TicketGlyph leadingEnd={value} />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Separator />

        <div className={clsx("flex items-center justify-between gap-4")}>
          <p className={clsx("min-w-0 text-sm text-muted-foreground")}>
            A sample ticket. No prize is used.
          </p>
          <Button
            variant="outline"
            disabled={testPrintMutation.isPending}
            onClick={() => void printTestTicket()}
          >
            {testPrintMutation.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <Printer data-icon="inline-start" />
            )}
            Print a test ticket
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
