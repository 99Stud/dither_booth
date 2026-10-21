import { WifiCard } from "@dither-booth/ui/components/misc/WifiCard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SETTINGS_LOG_SOURCE } from "#app/Settings/internal/Settings.constants";
import { errorMessage } from "#lib/feedback/error-message";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

const STATUS_POLL_MS = 15_000;

/**
 * The booth's Wi-Fi from a laptop or a phone: add the venue's network the
 * day before, so the booth joins it on its own once it's on site, or pick it
 * on site from the booth Wi-Fi.
 */
export const NetworkCard = () => {
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
      source: SETTINGS_LOG_SOURCE,
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
            report(
              error,
              "settings-wifi-save-failed",
              `Couldn't save ${input.ssid}.`,
            );
            return false;
          },
        );
        if (saved) {
          notify.success(
            input.connectNow
              ? `Joining ${input.ssid}.`
              : `${input.ssid} saved. The booth joins it when it's in range.`,
          );
        }
        await refresh();
        return saved;
      }}
      onForget={async (ssid) => {
        await forget
          .mutateAsync({ ssid })
          .then(() => notify.success(`${ssid} forgotten.`))
          .catch((error: unknown) =>
            report(
              error,
              "settings-wifi-forget-failed",
              `Couldn't forget ${ssid}.`,
            ),
          );
        await refresh();
      }}
      onSetBoothWifi={async (enabled) => {
        await boothWifi
          .mutateAsync({ enabled })
          .then(() =>
            notify.success(
              enabled
                ? "Switching to the booth Wi-Fi."
                : "Going back to saved networks.",
            ),
          )
          .catch((error: unknown) =>
            report(
              error,
              "settings-booth-wifi-failed",
              "Couldn't switch Wi-Fi.",
            ),
          );
        await refresh();
      }}
    />
  );
};
