import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { Tabs, TabsContent } from "@dither-booth/ui/components/ui/tabs";
import clsx from "clsx";
import { Dices, Gift, History, LayoutDashboard } from "lucide-react";
import { useState } from "react";

import {
  AppPageBody,
  AppPageHeading,
  AppPageTab,
  AppPageTabsList,
  AppSidebarPageHeader,
} from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";

import type { EventPrize, EventTab } from "./internal/Event.types";

import { EventCreateDialog } from "./internal/components/EventCreateDialog";
import { EventDrawsTable } from "./internal/components/EventDrawsTable";
import { EventEmptyState } from "./internal/components/EventEmptyState";
import { EventLotteryForm } from "./internal/components/EventLotteryForm";
import { EventOverviewPanel } from "./internal/components/EventOverviewPanel";
import { EventPrizeDialog } from "./internal/components/EventPrizeDialog";
import { EventPrizesTable } from "./internal/components/EventPrizesTable";
import { EventReplaceDialog } from "./internal/components/EventReplaceDialog";
import { EventRestockDialog } from "./internal/components/EventRestockDialog";
import { useEventQueries } from "./internal/hooks/useEventQueries";

export const Event = () => {
  const {
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
  } = useEventQueries();

  const [tab, setTab] = useState<EventTab>("overview");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false);
  const [isReplaceFormOpen, setIsReplaceFormOpen] = useState(false);
  const [prizeDialogMode, setPrizeDialogMode] = useState<"create" | "edit">(
    "create",
  );
  const [isPrizeDialogOpen, setIsPrizeDialogOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState<EventPrize | null>(null);
  const [restockPrize, setRestockPrize] = useState<EventPrize | null>(null);

  const event = currentEventQuery.data ?? null;
  const isLoading = currentEventQuery.isLoading;

  return (
    <Tabs
      className={clsx("gap-0")}
      value={tab}
      onValueChange={(value) => setTab(value as EventTab)}
    >
      <AppSidebarPageHeader title="Event" />

      <AppPageBody>
        <AppPageHeading
          title={event?.campaign.name ?? "Event"}
          tabs={
            event && (
              <AppPageTabsList>
                <AppPageTab value="overview">
                  <LayoutDashboard />
                  Overview
                </AppPageTab>
                <AppPageTab value="lottery">
                  <Dices />
                  Lottery
                </AppPageTab>
                <AppPageTab value="prizes">
                  <Gift />
                  Prizes
                </AppPageTab>
                <AppPageTab value="draws">
                  <History />
                  Draws
                </AppPageTab>
              </AppPageTabsList>
            )
          }
        />
        {isLoading ? (
          <div
            className={clsx("flex min-h-[40vh] items-center justify-center")}
          >
            <Spinner />
          </div>
        ) : !event ? (
          <EventEmptyState onCreateClick={() => setIsCreateOpen(true)} />
        ) : (
          <>
            <TabsContent value="overview" className={clsx("mt-0")}>
              <EventOverviewPanel
                event={event}
                isSavingDetails={updateEventMutation.isPending}
                isSavingTicketItems={updateTicketItemsMutation.isPending}
                onSaveDetails={async (values) => {
                  await updateEventMutation.mutateAsync(values);
                }}
                onSaveTicketItems={async (names) => {
                  await updateTicketItemsMutation.mutateAsync({ names });
                }}
                onReplaceClick={() => setIsReplaceConfirmOpen(true)}
              />
            </TabsContent>
            <TabsContent value="lottery" className={clsx("mt-0")}>
              <div className={clsx("flex flex-col gap-4")}>
                <EventLotteryForm
                  event={event}
                  isSaving={updateLotterySettingsMutation.isPending}
                  onSave={async (values) => {
                    await updateLotterySettingsMutation.mutateAsync(values);
                  }}
                />
              </div>
            </TabsContent>
            <TabsContent value="prizes" className={clsx("mt-0")}>
              <EventPrizesTable
                event={event}
                isDeleting={deletePrizeMutation.isPending}
                onAddClick={() => {
                  setPrizeDialogMode("create");
                  setEditingPrize(null);
                  setIsPrizeDialogOpen(true);
                }}
                onEditClick={(prize) => {
                  setPrizeDialogMode("edit");
                  setEditingPrize(prize);
                  setIsPrizeDialogOpen(true);
                }}
                onRestockClick={(prize) => setRestockPrize(prize)}
                onDelete={async (prizeId) => {
                  await deletePrizeMutation.mutateAsync({ prizeId });
                }}
              />
            </TabsContent>
            <TabsContent value="draws" className={clsx("mt-0")}>
              <EventDrawsTable />
            </TabsContent>
          </>
        )}
      </AppPageBody>

      <EventCreateDialog
        open={isCreateOpen}
        isPending={createEventMutation.isPending}
        onOpenChange={setIsCreateOpen}
        onSubmit={async (values) => {
          await createEventMutation.mutateAsync(values);
        }}
      />

      <EventCreateDialog
        open={isReplaceFormOpen}
        isPending={replaceEventMutation.isPending}
        title="Replace event"
        description="The current event is archived. Its prizes and draws are kept."
        submitLabel="Replace event"
        onOpenChange={setIsReplaceFormOpen}
        onSubmit={async (values) => {
          await replaceEventMutation.mutateAsync(values);
          setTab("overview");
        }}
      />

      <EventReplaceDialog
        open={isReplaceConfirmOpen}
        eventName={event?.campaign.name ?? "this event"}
        onOpenChange={setIsReplaceConfirmOpen}
        onConfirm={() => {
          setIsReplaceConfirmOpen(false);
          setIsReplaceFormOpen(true);
        }}
      />

      <EventPrizeDialog
        open={isPrizeDialogOpen}
        mode={prizeDialogMode}
        prize={editingPrize}
        prizes={event?.prizes ?? []}
        noWinWeight={event?.lottery.noWinWeight ?? 0}
        winCooldownMinutes={event?.lottery.winCooldownMinutes ?? 0}
        isPending={
          createPrizeMutation.isPending || updatePrizeMutation.isPending
        }
        onOpenChange={setIsPrizeDialogOpen}
        onSubmit={async (values) => {
          if (prizeDialogMode === "create") {
            await createPrizeMutation.mutateAsync(values);
            return;
          }
          if (!editingPrize) return;
          // Stock is not editable here: it only moves through Restock.
          const { quantity: _quantity, ...fields } = values;
          await updatePrizeMutation.mutateAsync({
            prizeId: editingPrize.id,
            ...fields,
          });
        }}
      />

      <EventRestockDialog
        open={restockPrize !== null}
        prize={restockPrize}
        isPending={restockPrizeMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setRestockPrize(null);
        }}
        onSubmit={async (values) => {
          if (!restockPrize) return;
          await restockPrizeMutation.mutateAsync({
            prizeId: restockPrize.id,
            ...values,
          });
        }}
      />
    </Tabs>
  );
};
