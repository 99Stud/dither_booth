import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dither-booth/ui/components/ui/tabs";
import clsx from "clsx";
import { useState } from "react";

import { AppSidebarPageHeader } from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";

import type { EventPrize, EventTab } from "./internal/Event.types";

import { EventCreateDialog } from "./internal/components/EventCreateDialog";
import { EventDrawsTable } from "./internal/components/EventDrawsTable";
import { EventEmptyState } from "./internal/components/EventEmptyState";
import { EventLotteryForm } from "./internal/components/EventLotteryForm";
import { EventOverviewPanel } from "./internal/components/EventOverviewPanel";
import { EventPrizeSheet } from "./internal/components/EventPrizeSheet";
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
  const [prizeSheetMode, setPrizeSheetMode] = useState<"create" | "edit">(
    "create",
  );
  const [isPrizeSheetOpen, setIsPrizeSheetOpen] = useState(false);
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
      <AppSidebarPageHeader title="Event">
        {event && (
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="lottery">Lottery</TabsTrigger>
            <TabsTrigger value="prizes">Prizes</TabsTrigger>
            <TabsTrigger value="draws">Draws</TabsTrigger>
          </TabsList>
        )}
      </AppSidebarPageHeader>

      <div className={clsx("px-4 pb-8")}>
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
                isSavingName={updateEventMutation.isPending}
                isSavingTicketItems={updateTicketItemsMutation.isPending}
                onSaveName={async (name) => {
                  await updateEventMutation.mutateAsync({ name });
                }}
                onSaveTicketItems={async (names) => {
                  await updateTicketItemsMutation.mutateAsync({ names });
                }}
                onReplaceClick={() => setIsReplaceConfirmOpen(true)}
              />
            </TabsContent>
            <TabsContent value="lottery" className={clsx("mt-0")}>
              <EventLotteryForm
                event={event}
                isSaving={updateLotterySettingsMutation.isPending}
                onSave={async (values) => {
                  await updateLotterySettingsMutation.mutateAsync(values);
                }}
              />
            </TabsContent>
            <TabsContent value="prizes" className={clsx("mt-0")}>
              <EventPrizesTable
                event={event}
                isDeleting={deletePrizeMutation.isPending}
                onAddClick={() => {
                  setPrizeSheetMode("create");
                  setEditingPrize(null);
                  setIsPrizeSheetOpen(true);
                }}
                onEditClick={(prize) => {
                  setPrizeSheetMode("edit");
                  setEditingPrize(prize);
                  setIsPrizeSheetOpen(true);
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
      </div>

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
        description="Creates a new event after wiping the current campaign, lottery, prizes, and draws."
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

      <EventPrizeSheet
        open={isPrizeSheetOpen}
        mode={prizeSheetMode}
        prize={editingPrize}
        isPending={
          createPrizeMutation.isPending || updatePrizeMutation.isPending
        }
        onOpenChange={setIsPrizeSheetOpen}
        onSubmit={async (values) => {
          if (prizeSheetMode === "create") {
            await createPrizeMutation.mutateAsync(values);
            return;
          }
          if (!editingPrize) return;
          await updatePrizeMutation.mutateAsync({
            prizeId: editingPrize.id,
            ...values,
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
