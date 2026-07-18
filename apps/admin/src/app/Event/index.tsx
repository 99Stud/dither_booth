import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dither-booth/ui/components/ui/tabs";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { useState } from "react";

import { AppSidebarPageHeader } from "#components/Layout/AppSidebar/external/components/AppSidebarPageHeader/index";

import type { EventLot, EventTab } from "./internal/Event.types";

import { EventCreateDialog } from "./internal/components/EventCreateDialog";
import { EventEmptyState } from "./internal/components/EventEmptyState";
import { EventLotteryForm } from "./internal/components/EventLotteryForm";
import { EventLotSheet } from "./internal/components/EventLotSheet";
import { EventLotsTable } from "./internal/components/EventLotsTable";
import { EventOverviewPanel } from "./internal/components/EventOverviewPanel";
import { EventReplaceDialog } from "./internal/components/EventReplaceDialog";
import { EventRestockDialog } from "./internal/components/EventRestockDialog";
import { useEventQueries } from "./internal/hooks/useEventQueries";

export const Event = () => {
  const {
    currentEventQuery,
    createEventMutation,
    updateEventMutation,
    replaceEventMutation,
    updateLotterySettingsMutation,
    createLotMutation,
    updateLotMutation,
    deleteLotMutation,
    restockLotMutation,
  } = useEventQueries();

  const [tab, setTab] = useState<EventTab>("overview");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false);
  const [isReplaceFormOpen, setIsReplaceFormOpen] = useState(false);
  const [lotSheetMode, setLotSheetMode] = useState<"create" | "edit">("create");
  const [isLotSheetOpen, setIsLotSheetOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<EventLot | null>(null);
  const [restockLot, setRestockLot] = useState<EventLot | null>(null);

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
            <TabsTrigger value="lots">Lots</TabsTrigger>
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
                onSaveName={async (name) => {
                  await updateEventMutation.mutateAsync({ name });
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
            <TabsContent value="lots" className={clsx("mt-0")}>
              <EventLotsTable
                event={event}
                isDeleting={deleteLotMutation.isPending}
                onAddClick={() => {
                  setLotSheetMode("create");
                  setEditingLot(null);
                  setIsLotSheetOpen(true);
                }}
                onEditClick={(lot) => {
                  setLotSheetMode("edit");
                  setEditingLot(lot);
                  setIsLotSheetOpen(true);
                }}
                onRestockClick={(lot) => setRestockLot(lot)}
                onDelete={async (lotId) => {
                  await deleteLotMutation.mutateAsync({ lotId });
                }}
              />
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
        description="Creates a new event after wiping the current campaign, lottery, lots, and draws."
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

      <EventLotSheet
        open={isLotSheetOpen}
        mode={lotSheetMode}
        lot={editingLot}
        isPending={createLotMutation.isPending || updateLotMutation.isPending}
        onOpenChange={setIsLotSheetOpen}
        onSubmit={async (values) => {
          if (lotSheetMode === "create") {
            await createLotMutation.mutateAsync(values);
            return;
          }
          if (!editingLot) return;
          await updateLotMutation.mutateAsync({
            lotId: editingLot.id,
            ...values,
          });
        }}
      />

      <EventRestockDialog
        open={restockLot !== null}
        lot={restockLot}
        isPending={restockLotMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setRestockLot(null);
        }}
        onSubmit={async (values) => {
          if (!restockLot) return;
          await restockLotMutation.mutateAsync({
            lotId: restockLot.id,
            ...values,
          });
        }}
      />
    </Tabs>
  );
};
