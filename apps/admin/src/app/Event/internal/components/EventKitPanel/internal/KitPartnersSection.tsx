import type { FC } from "react";

import {
  MAX_PARTNERS,
  type KitPartners,
} from "@dither-booth/shared/kit-partners";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
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
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { GripVertical, Handshake, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { useTRPC } from "#lib/trpc/trpc.client";

import { KitLogo } from "./KitLogo";
import { KitLogoLibrarySheet } from "./KitLogoLibrarySheet";

interface KitPartnersSectionProps {
  value: KitPartners;
  onChange: (partners: KitPartners) => void;
}

/** One logo in the partner row, dragged by its grip (mouse, touch or keys). */
const SortablePartner: FC<{
  id: string;
  index: number;
  name: string;
  onRemove: () => void;
}> = ({ id, index, name, onRemove }) => {
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
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        "flex items-center gap-2 rounded-lg bg-card",
        isDragging && "relative z-10 shadow-lg ring-1 ring-ring/40",
      )}
    >
      <Button
        ref={setActivatorNodeRef}
        aria-label={`Reorder logo ${index + 1}`}
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
      <KitLogo id={id} name={name} className={clsx("h-12 w-24 shrink-0")} />
      <p className={clsx("min-w-0 flex-1 truncate text-sm font-medium")}>
        {name}
      </p>
      <Button
        aria-label={`Take ${name} out of the row`}
        type="button"
        size="icon"
        variant="ghost"
        className={clsx("text-muted-foreground hover:text-destructive")}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </li>
  );
};

/**
 * The event's partner row: up to four logos printed across the photo
 * receipt, in this order. They belong to the event, so they stay when the
 * kit changes.
 */
export const KitPartnersSection: FC<KitPartnersSectionProps> = (props) => {
  const { value, onChange } = props;
  const trpc = useTRPC();
  const assets = useQuery(trpc.config.listLogoAssets.queryOptions());
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const sensors = useSensors(
    // A small distance before dragging, so taps on the grip don't jitter.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const isRowFull = value.length >= MAX_PARTNERS;
  const nameOf = (id: string) =>
    assets.data?.find((asset) => asset.id === id)?.name ?? "Logo";

  const moveLogo = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = value.indexOf(String(active.id));
    const to = value.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    haptic("light");
    onChange(arrayMove(value, from, to));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="emerald">
            <Handshake />
          </IconBubble>
          Partners
        </CardTitle>
        <CardDescription>
          Up to {MAX_PARTNERS} logos printed side by side on the photo receipt,
          in this order. With none, the row isn&apos;t printed.
        </CardDescription>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-3")}>
        {value.length === 0 ? (
          <p className={clsx("text-sm text-muted-foreground")}>
            No partner logos: the photo receipt has no partner row.
          </p>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            sensors={sensors}
            onDragStart={() => haptic("medium")}
            onDragEnd={moveLogo}
          >
            <SortableContext
              items={value}
              strategy={verticalListSortingStrategy}
            >
              <ol className={clsx("flex flex-col gap-2")}>
                {value.map((id, index) => (
                  <SortablePartner
                    key={id}
                    id={id}
                    index={index}
                    name={nameOf(id)}
                    onRemove={() =>
                      onChange(value.filter((partner) => partner !== id))
                    }
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
        <div className={clsx("flex flex-wrap items-center gap-3")}>
          <Button
            type="button"
            variant="outline"
            disabled={isRowFull}
            onClick={() => setIsLibraryOpen(true)}
          >
            <Plus data-icon="inline-start" />
            Add logo
          </Button>
          {isRowFull ? (
            <p className={clsx("text-sm text-muted-foreground")}>
              The row is full. Take a logo out to add another.
            </p>
          ) : null}
        </div>
      </CardContent>
      <KitLogoLibrarySheet
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        partners={value}
        onAdd={(id) => {
          if (!value.includes(id) && value.length < MAX_PARTNERS) {
            onChange([...value, id]);
          }
        }}
      />
    </Card>
  );
};
