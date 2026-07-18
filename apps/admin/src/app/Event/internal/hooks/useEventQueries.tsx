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

  const createLotMutation = useMutation({
    ...trpc.createLot.mutationOptions(),
    onSuccess: async () => {
      toast.success("Lot added");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "create-lot-failed", "Failed to add lot.");
    },
  });

  const updateLotMutation = useMutation({
    ...trpc.updateLot.mutationOptions(),
    onSuccess: async () => {
      toast.success("Lot updated");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "update-lot-failed", "Failed to update lot.");
    },
  });

  const deleteLotMutation = useMutation({
    ...trpc.deleteLot.mutationOptions(),
    onSuccess: async () => {
      toast.success("Lot deleted");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "delete-lot-failed", "Failed to delete lot.");
    },
  });

  const restockLotMutation = useMutation({
    ...trpc.restockLot.mutationOptions(),
    onSuccess: async () => {
      toast.success("Lot restocked");
      await invalidateCurrentEvent();
    },
    onError: (error) => {
      reportEventError(error, "restock-lot-failed", "Failed to restock lot.");
    },
  });

  return {
    currentEventQuery,
    createEventMutation,
    updateEventMutation,
    replaceEventMutation,
    updateLotterySettingsMutation,
    createLotMutation,
    updateLotMutation,
    deleteLotMutation,
    restockLotMutation,
  };
};
