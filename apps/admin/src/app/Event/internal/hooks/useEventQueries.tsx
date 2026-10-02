import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "#lib/trpc/trpc.client";

import { reportEventError } from "../Event.utils";

export const useEventQueries = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const currentEventQueryOptions = trpc.getCurrentEvent.queryOptions();
  const currentEventQuery = useQuery(currentEventQueryOptions);

  const invalidateCurrentEvent = async () => {
    await queryClient.invalidateQueries(trpc.getCurrentEvent.queryFilter());
  };

  const createEventMutation = useMutation({
    ...trpc.createEvent.mutationOptions(),
    onSuccess: async () => {
      toast.success("Event created");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "create-event-failed", "Failed to create event.");
    },
  });

  const updateTicketItemsMutation = useMutation({
    ...trpc.updateTicketItems.mutationOptions(),
    onSuccess: async () => {
      toast.success("Ticket items saved");
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
    ...trpc.updateEvent.mutationOptions(),
    onSuccess: async () => {
      toast.success("Event updated");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "update-event-failed", "Failed to update event.");
    },
  });

  const replaceEventMutation = useMutation({
    ...trpc.replaceEvent.mutationOptions(),
    onSuccess: async () => {
      toast.success("Event replaced");
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
    ...trpc.updateLotterySettings.mutationOptions(),
    onSuccess: async () => {
      toast.success("Lottery settings saved");
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
    ...trpc.createPrize.mutationOptions(),
    onSuccess: async () => {
      toast.success("Prize added");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "create-prize-failed", "Failed to add prize.");
    },
  });

  const updatePrizeMutation = useMutation({
    ...trpc.updatePrize.mutationOptions(),
    onSuccess: async () => {
      toast.success("Prize updated");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "update-prize-failed", "Failed to update prize.");
    },
  });

  const deletePrizeMutation = useMutation({
    ...trpc.deletePrize.mutationOptions(),
    onSuccess: async () => {
      toast.success("Prize deleted");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "delete-prize-failed", "Failed to delete prize.");
    },
  });

  const restockPrizeMutation = useMutation({
    ...trpc.restockPrize.mutationOptions(),
    onSuccess: async () => {
      toast.success("Prize restocked");
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

  const printSampleLotteryTicketMutation = useMutation({
    ...trpc.printSampleLotteryTicket.mutationOptions(),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.outcome === "win"
          ? "Win ticket sent to the printer"
          : "Lose ticket sent to the printer",
      );
    },
    onError: (error) => {
      reportEventError(
        error,
        "print-sample-lottery-ticket-failed",
        "Failed to print sample ticket.",
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
    printSampleLotteryTicketMutation,
  };
};
