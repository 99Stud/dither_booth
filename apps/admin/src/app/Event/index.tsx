import { Button } from "@dither-booth/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dither-booth/ui/components/ui/dropdown-menu";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { Tabs, TabsContent } from "@dither-booth/ui/components/ui/tabs";
import clsx from "clsx";
import {
  Dices,
  Gift,
  History,
  LayoutDashboard,
  MoreHorizontal,
  Palette,
  PencilLine,
  RefreshCw,
} from "lucide-react";
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
import { EventDetailsDialog } from "./internal/components/EventDetailsDialog";
import { EventDrawsTable } from "./internal/components/EventDrawsTable";
import { EventEmptyState } from "./internal/components/EventEmptyState";
import { EventKitPanel } from "./internal/components/EventKitPanel";
import { EventLotteryForm } from "./internal/components/EventLotteryForm";
import { EventOverviewPanel } from "./internal/components/EventOverviewPanel";
import { EventPrizeDialog } from "./internal/components/EventPrizeDialog";
import { EventPrizesTable } from "./internal/components/EventPrizesTable";
import { EventReplaceDialog } from "./internal/components/EventReplaceDialog";
import { EventRestockDialog } from "./internal/components/EventRestockDialog";
import { EventTicketItemsCard } from "./internal/components/EventTicketItemsCard";
import { toStartEnd } from "./internal/Event.constants";
import { useEventQueries } from "./internal/hooks/useEventQueries";

export const Event = () => {
  const {
    currentEventQuery,
    createEventMutation,
    updateEventMutation,
    updateTicketItemsMutation,
    updateKitSettingsMutation,
    replaceEventMutation,
    updateLotterySettingsMutation,
    createPrizeMutation,
    updatePrizeMutation,
    deletePrizeMutation,
    restockPrizeMutation,
  } = useEventQueries();

  const [tab, setTab] = useState<EventTab>("overview");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false);
  const [isReplaceFormOpen, setIsReplaceFormOpen] = useState(false);
  const [prizeDialogMode, setPrizeDialogMode] = useState<"create" | "edit">(
    "create",
  );
  const [isPrizeDialogOpen, setIsPrizeDialogOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState<EventPrize | null>(null);
  const [restockPrize, setRestockPrize] = useState<EventPrize | null>(null);
  // A failed print's ticket, looked up in Draws from the Overview.
  const [lookedUpTicketRef, setLookedUpTicketRef] = useState<string>();

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
          actions={
            event && (
              <div className={clsx("flex flex-wrap gap-2")}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDetailsOpen(true)}
                >
                  <PencilLine data-icon="inline-start" />
                  Edit details
                </Button>
                {/* Out of the way: replacing archives the whole event. */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline" size="icon" />}
                  >
                    <MoreHorizontal />
                    <span className="sr-only">More event actions</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="w-auto"
                  >
                    <DropdownMenuItem
                      onClick={() => setIsReplaceConfirmOpen(true)}
                    >
                      <RefreshCw />
                      Replace event
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          }
          tabs={
            event && (
              <AppPageTabsList>
                <AppPageTab value="overview">
                  <LayoutDashboard />
                  Overview
                </AppPageTab>
                <AppPageTab value="kit">
                  <Palette />
                  Kit
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
                onOpenLottery={() => setTab("lottery")}
                onOpenPrizes={() => setTab("prizes")}
                onRestock={(prize) => setRestockPrize(prize)}
                onTurnOnLottery={async () => {
                  const { noWinWeight, winCooldownMinutes, printLoserTicket } =
                    event.lottery;
                  await updateLotterySettingsMutation.mutateAsync({
                    enabled: true,
                    noWinWeight,
                    winCooldownMinutes,
                    printLoserTicket,
                  });
                }}
                isTurningOnLottery={updateLotterySettingsMutation.isPending}
                onEditDetails={() => setIsDetailsOpen(true)}
                onLookUpTicket={(ticketRef) => {
                  setLookedUpTicketRef(ticketRef);
                  setTab("draws");
                }}
              />
            </TabsContent>
            <TabsContent value="kit" className={clsx("mt-0")}>
              <EventKitPanel
                // A save (or a new event) restarts the draft from what is
                // stored; edits on other tabs leave it alone.
                key={`${event.campaign.id}:${event.campaign.kitId}:${JSON.stringify(event.campaign.kitSettings)}`}
                event={event}
                isSaving={updateKitSettingsMutation.isPending}
                onSave={async (input) => {
                  await updateKitSettingsMutation.mutateAsync(input);
                }}
                ticketItems={
                  <EventTicketItemsCard
                    event={event}
                    isSaving={updateTicketItemsMutation.isPending}
                    onSave={async (names) => {
                      await updateTicketItemsMutation.mutateAsync({ names });
                    }}
                  />
                }
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
              <EventDrawsTable
                key={lookedUpTicketRef ?? "latest"}
                initialTicketRef={lookedUpTicketRef}
              />
            </TabsContent>
          </>
        )}
      </AppPageBody>

      {event && (
        <EventDetailsDialog
          event={event}
          open={isDetailsOpen}
          isPending={updateEventMutation.isPending}
          onOpenChange={setIsDetailsOpen}
          onSubmit={async (values) => {
            await updateEventMutation.mutateAsync(toStartEnd(values));
          }}
        />
      )}
      <EventCreateDialog
        open={isCreateOpen}
        isPending={createEventMutation.isPending}
        onOpenChange={setIsCreateOpen}
        onSubmit={async (values) => {
          await createEventMutation.mutateAsync(toStartEnd(values));
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
          await replaceEventMutation.mutateAsync(toStartEnd(values));
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
