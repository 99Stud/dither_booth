import type { TextFieldName } from "@dither-booth/ui/fields/TextField";
import type { FC, ReactNode } from "react";

import {
  TICKET_ITEM_NAME_MAX_LENGTH,
  TICKET_ITEM_NAMES_MAX_COUNT,
} from "@dither-booth/shared/ticket";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { TextField } from "@dither-booth/ui/fields/TextField";
import { haptic } from "@dither-booth/ui/haptics";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import { GripVertical, Plus, ReceiptText, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { CurrentEvent, TicketItemsFormValues } from "../../Event.types";

import {
  TICKET_ITEMS_FORM_SCHEMA,
  getTicketItemsFormValues,
} from "../../Event.constants";

const ticketItemFieldName = (
  index: number,
): TextFieldName<TicketItemsFormValues> =>
  `names[${index}]` as TextFieldName<TicketItemsFormValues>;

/**
 * Item names can repeat or be empty, so each row gets its own id for
 * dnd-kit, kept in step with the form's array on every add, remove and move.
 */
const createRowIds = (count: number): string[] =>
  Array.from({ length: count }, () => crypto.randomUUID());

/** One ticket item row, dragged by its grip (mouse, touch or keyboard). */
const SortableTicketItem: FC<{
  id: string;
  index: number;
  children: ReactNode;
}> = ({ id, index, children }) => {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        "flex items-center gap-1 rounded-lg bg-card",
        isDragging && "relative z-10 shadow-lg ring-1 ring-ring/40",
      )}
    >
      <Button
        ref={setActivatorNodeRef}
        aria-label={`Reorder item ${index + 1}`}
        type="button"
        size="icon"
        variant="ghost"
        className={clsx(
          "cursor-grab touch-none text-muted-foreground active:cursor-grabbing",
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </Button>
      {children}
    </div>
  );
};

export const EventTicketItemsCard: FC<{
  event: CurrentEvent;
  isSaving: boolean;
  onSave: (names: string[]) => Promise<void>;
}> = (props) => {
  const { event, isSaving, onSave } = props;
  const namesKey = event.campaign.ticketItemNames.join("\u0000");
  const [rowIds, setRowIds] = useState(() =>
    createRowIds(event.campaign.ticketItemNames.length),
  );
  const sensors = useSensors(
    // A small distance before dragging, so taps on the grip don't jitter.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const form = useForm({
    defaultValues: getTicketItemsFormValues(event),
    validators: {
      onChange: TICKET_ITEMS_FORM_SCHEMA,
      onSubmit: TICKET_ITEMS_FORM_SCHEMA,
    },
    onSubmit: async ({ value }) => {
      await onSave(value.names);
    },
  });

  useEffect(() => {
    form.reset(getTicketItemsFormValues(event));
    setRowIds(createRowIds(event.campaign.ticketItemNames.length));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- sync when saved names change
  }, [event.campaign.id, namesKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="amber">
            <ReceiptText />
          </IconBubble>
          Ticket items
        </CardTitle>
        <CardDescription>
          The items printed on the photo receipt, in this order. They save with
          Save items, not with the kit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className={clsx("flex flex-col gap-4")}
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            submitEvent.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="names" mode="array">
            {(field) => {
              const moveRow = ({ active, over }: DragEndEvent) => {
                if (!over || active.id === over.id) return;
                // The row lands in its new place.
                haptic("light");

                const from = rowIds.indexOf(String(active.id));
                const to = rowIds.indexOf(String(over.id));
                if (from === -1 || to === -1) return;

                field.moveValue(from, to);
                setRowIds((ids) => arrayMove(ids, from, to));
              };

              return (
                <div className={clsx("flex flex-col gap-3")}>
                  <DndContext
                    collisionDetection={closestCenter}
                    modifiers={[
                      restrictToVerticalAxis,
                      restrictToParentElement,
                    ]}
                    sensors={sensors}
                    // A firm tap as the row lifts, as iOS lists do.
                    onDragStart={() => haptic("medium")}
                    onDragEnd={moveRow}
                  >
                    <SortableContext
                      items={rowIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className={clsx("flex flex-col gap-3")}>
                        {field.state.value.map((_, index) => (
                          <SortableTicketItem
                            key={rowIds[index] ?? index}
                            id={rowIds[index] ?? String(index)}
                            index={index}
                          >
                            <TextField
                              className={clsx("min-w-0 flex-1")}
                              form={form}
                              name={ticketItemFieldName(index)}
                              label={`Item ${index + 1}`}
                              hideLabel
                              placeholder={`Item ${index + 1}`}
                              maxLength={TICKET_ITEM_NAME_MAX_LENGTH}
                              enterKeyHint="done"
                            />
                            <Button
                              aria-label={`Remove item ${index + 1}`}
                              type="button"
                              size="icon"
                              variant="ghost"
                              className={clsx(
                                "text-muted-foreground hover:text-destructive",
                              )}
                              disabled={field.state.value.length <= 1}
                              onClick={() => {
                                field.removeValue(index);
                                setRowIds((ids) =>
                                  ids.filter((_, i) => i !== index),
                                );
                              }}
                            >
                              <Trash2 />
                            </Button>
                          </SortableTicketItem>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <div className={clsx("flex flex-wrap justify-between gap-2")}>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={
                        field.state.value.length >= TICKET_ITEM_NAMES_MAX_COUNT
                      }
                      onClick={() => {
                        field.pushValue("");
                        setRowIds((ids) => [...ids, crypto.randomUUID()]);
                      }}
                    >
                      <Plus data-icon="inline-start" />
                      Add item
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                      <Save data-icon="inline-start" />
                      Save items
                    </Button>
                  </div>
                </div>
              );
            }}
          </form.Field>
        </form>
      </CardContent>
    </Card>
  );
};
