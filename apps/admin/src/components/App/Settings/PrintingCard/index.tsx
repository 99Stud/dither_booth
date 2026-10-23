import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Switch } from "@dither-booth/ui/components/ui/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Printer } from "lucide-react";

import { SETTINGS_LOG_SOURCE } from "#app/Settings/internal/Settings.constants";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

/**
 * Which way up the photo receipt and the lottery ticket print. On by default,
 * so a guest tearing the paper off reads it the right way up.
 */
export const PrintingCard = () => {
  const trpc = useTRPC();
  const printConfigurationQuery = useQuery(
    trpc.config.getPrintConfiguration.queryOptions(),
  );
  const upsideDownMutation = useMutation(
    trpc.config.updatePrintConfiguration.mutationOptions(),
  );
  const printConfiguration = printConfigurationQuery.data;
  const isUpsideDown = upsideDownMutation.isPending
    ? upsideDownMutation.variables.upsideDown
    : (printConfiguration?.upsideDown ?? true);

  const setUpsideDown = async (upsideDown: boolean) => {
    const saved = await upsideDownMutation
      .mutateAsync({ upsideDown })
      .then(() => true)
      .catch((error: unknown) => {
        reportKioskError(error, {
          event: "settings-upside-down-failed",
          source: SETTINGS_LOG_SOURCE,
          userMessage: "Couldn't change which way up tickets print.",
        });
        return false;
      });

    await printConfigurationQuery.refetch();
    if (saved) {
      notify.success(
        upsideDown
          ? "Tickets now print upside down."
          : "Tickets now print the right way up.",
      );
    }
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
      </CardHeader>
      <CardContent>
        <div className={clsx("flex items-start justify-between gap-4")}>
          <div className={clsx("min-w-0")}>
            <label
              className={clsx("text-sm font-medium")}
              htmlFor="print-upside-down"
            >
              Print tickets upside down
            </label>
            <p className={clsx("text-sm text-muted-foreground")}>
              Turns the photo receipt and the lottery ticket around, so they
              read the right way up as they come out of the printer. Setup and
              Wi-Fi tickets aren't affected.
            </p>
          </div>
          <Switch
            id="print-upside-down"
            checked={isUpsideDown}
            disabled={!printConfiguration || upsideDownMutation.isPending}
            onCheckedChange={setUpsideDown}
          />
        </div>
      </CardContent>
    </Card>
  );
};
