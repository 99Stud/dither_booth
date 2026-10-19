import type { FC } from "react";

import { WifiCard } from "@dither-booth/ui/components/misc/WifiCard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

const NETWORK_LOG_SOURCE = "shutter.darkroom.network";
const STATUS_POLL_MS = 10_000;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/** Pick the venue's Wi-Fi from the booth iPad, e.g. while on the booth Wi-Fi. */
export const DarkroomWifiCard: FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const statusQuery = useQuery(
    trpc.config.getNetworkStatus.queryOptions(undefined, {
      refetchInterval: STATUS_POLL_MS,
    }),
  );
  const save = useMutation(trpc.config.saveWifiNetwork.mutationOptions());
  const forget = useMutation(trpc.config.forgetWifiNetwork.mutationOptions());
  const boothWifi = useMutation(trpc.config.setBoothWifi.mutationOptions());
  const refresh = () =>
    queryClient.invalidateQueries(trpc.config.getNetworkStatus.queryFilter());
  const report = (error: unknown, event: string, userMessage: string) =>
    reportKioskError(error, {
      event,
      source: NETWORK_LOG_SOURCE,
      userMessage: `${userMessage} ${errorMessage(error)}`,
    });

  return (
    <WifiCard
      status={statusQuery.data}
      isPending={save.isPending || forget.isPending || boothWifi.isPending}
      onSave={async (input) => {
        const saved = await save.mutateAsync(input).then(
          () => true,
          (error: unknown) => {
            report(error, "wifi-save-failed", `Couldn't save ${input.ssid}.`);
            return false;
          },
        );
        if (saved && !input.connectNow) toast.success(`${input.ssid} saved.`);
        await refresh();
        return saved;
      }}
      onForget={async (ssid) => {
        await forget
          .mutateAsync({ ssid })
          .then(() => toast.success(`${ssid} forgotten.`))
          .catch((error: unknown) =>
            report(error, "wifi-forget-failed", `Couldn't forget ${ssid}.`),
          );
        await refresh();
      }}
      onSetBoothWifi={async (enabled) => {
        await boothWifi
          .mutateAsync({ enabled })
          .then(() =>
            toast.success(
              enabled
                ? "Switching to the booth Wi-Fi. Join it on this iPad."
                : "Going back to saved networks.",
            ),
          )
          .catch((error: unknown) =>
            report(error, "booth-wifi-failed", "Couldn't switch Wi-Fi."),
          );
        await refresh();
      }}
    />
  );
};
