import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notify } from "#lib/feedback/notify";
import { useTRPC } from "#lib/trpc/trpc.client";

import { reportEventError } from "../Event.utils";

export const useEventQueries = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const currentEventQueryOptions = trpc.config.getCurrentEvent.queryOptions();
  const currentEventQuery = useQuery(currentEventQueryOptions);

  const invalidateCurrentEvent = async () => {
    await queryClient.invalidateQueries(
      trpc.config.getCurrentEvent.queryFilter(),
    );
  };

  const createEventMutation = useMutation({
    ...trpc.config.createEvent.mutationOptions(),
    onSuccess: async () => {
      notify.success("Event created");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "create-event-failed", "Failed to create event.");
    },
  });

  const updateTicketItemsMutation = useMutation({
    ...trpc.config.updateTicketItems.mutationOptions(),
    onSuccess: async () => {
      notify.success("Ticket items saved");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(
        error,
        "update-ticket-items-failed",
        "Failed to save ticket items.",
      );
    },
  });

  const updateEventMutation = useMutation({
    ...trpc.config.updateEvent.mutationOptions(),
    onSuccess: async () => {
      notify.success("Event updated");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "update-event-failed", "Failed to update event.");
    },
  });

  const replaceEventMutation = useMutation({
    ...trpc.config.replaceEvent.mutationOptions(),
    onSuccess: async () => {
      notify.success("Event replaced");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(
        error,
        "replace-event-failed",
        "Failed to replace event.",
      );
    },
  });

  const updateLotterySettingsMutation = useMutation({
    ...trpc.config.updateLotterySettings.mutationOptions(),
    onSuccess: async () => {
      notify.success("Lottery settings saved");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(
        error,
        "update-lottery-settings-failed",
        "Failed to save lottery settings.",
      );
    },
  });

  const createPrizeMutation = useMutation({
    ...trpc.config.createPrize.mutationOptions(),
    onSuccess: async () => {
      notify.success("Prize added");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "create-prize-failed", "Failed to add prize.");
    },
  });

  const updatePrizeMutation = useMutation({
    ...trpc.config.updatePrize.mutationOptions(),
    onSuccess: async () => {
      notify.success("Prize updated");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "update-prize-failed", "Failed to update prize.");
    },
  });

  const deletePrizeMutation = useMutation({
    ...trpc.config.deletePrize.mutationOptions(),
    onSuccess: async () => {
      notify.success("Prize deleted");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "delete-prize-failed", "Failed to delete prize.");
    },
  });

  const restockPrizeMutation = useMutation({
    ...trpc.config.restockPrize.mutationOptions(),
    onSuccess: async () => {
      notify.success("Prize restocked");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(
        error,
        "restock-prize-failed",
        "Failed to restock prize.",
      );
    },
  });

  return {
    currentEventQuery,
    createEventMutation,
    updateEventMutation,
    updateTicketItemsMutation,
    replaceEventMutation,
    updateLotterySettingsMutation,
    createPrizeMutation,
    updatePrizeMutation,
    deletePrizeMutation,
    restockPrizeMutation,
  };
};
