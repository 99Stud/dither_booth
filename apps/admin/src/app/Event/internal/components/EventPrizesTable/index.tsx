import type { FC } from "react";

import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dither-booth/ui/components/ui/alert-dialog";
import { Badge } from "@dither-booth/ui/components/ui/badge";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardAction,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dither-booth/ui/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@dither-booth/ui/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dither-booth/ui/components/ui/table";
import clsx from "clsx";
import {
  Gift,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { RarityBadge } from "#components/Misc/RarityBadge/index";

import type { CurrentEvent, EventPrize } from "../../Event.types";

import {
  computeOdds,
  formatOneIn,
  usesRarityDefaultWeight,
} from "../../lottery-odds.utils";

interface EventPrizesTableProps {
  event: CurrentEvent;
  isDeleting: boolean;
  onAddClick: () => void;
  onEditClick: (prize: EventPrize) => void;
  onRestockClick: (prize: EventPrize) => void;
  onDelete: (prizeId: string) => Promise<void>;
}

/** "4 / 10" with a thin bar, so empty and nearly empty prizes stand out. */
const StockMeter: FC<{ remaining: number; total: number }> = ({
  remaining,
  total,
}) => {
  const ratio = total > 0 ? Math.min(1, remaining / total) : 0;

  return (
    <div className={clsx("flex min-w-36 items-center gap-2")}>
      <span className={clsx("min-w-16 text-sm whitespace-nowrap tabular-nums")}>
        {remaining}
        <span className={clsx("text-muted-foreground")}> / {total}</span>
      </span>
      <div
        className={clsx("h-1.5 flex-1 overflow-hidden rounded-full bg-muted")}
      >
        <div
          className={clsx(
            "h-full rounded-full",
            remaining === 0
              ? "bg-destructive"
              : ratio < 0.2
                ? "bg-warning"
                : "bg-brand",
          )}
          style={{ width: `${Math.max(ratio * 100, remaining > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
};

export const EventPrizesTable: FC<EventPrizesTableProps> = (props) => {
  const {
    event,
    isDeleting,
    onAddClick,
    onEditClick,
    onRestockClick,
    onDelete,
  } = props;

  const [prizeToDelete, setPrizeToDelete] = useState<EventPrize | null>(null);
  const chanceById = new Map(
    computeOdds({
      noWinWeight: event.lottery.noWinWeight,
      prizes: event.prizes,
    }).byPrize.map((prize) => [prize.id, prize.chance]),
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className={clsx("flex items-center gap-2.5")}>
            <IconBubble tone="rose">
              <Gift />
            </IconBubble>
            Prizes
          </CardTitle>
          <CardAction>
            <Button onClick={onAddClick}>
              <Plus data-icon="inline-start" />
              Add prize
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {event.prizes.length === 0 ? (
            <Empty className={clsx("border border-dashed")}>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Gift />
                </EmptyMedia>
                <EmptyTitle>No prizes yet</EmptyTitle>
                <EmptyDescription>
                  Add a first prize: guests can win it with each photo.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className={clsx("overflow-hidden rounded-lg border")}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Rarity</TableHead>
                    <TableHead>Chance per guest</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className={clsx("w-12")} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {event.prizes.map((prize) => (
                    <TableRow key={prize.id}>
                      <TableCell className={clsx("font-medium")}>
                        {prize.title}
                      </TableCell>
                      <TableCell>
                        <RarityBadge rarity={prize.rarity} />
                      </TableCell>
                      <TableCell
                        className={clsx("tabular-nums")}
                        title={`Weight ${prize.weight}`}
                      >
                        {chanceById.has(prize.id) ? (
                          <span className={clsx("flex items-center gap-1.5")}>
                            {formatOneIn(chanceById.get(prize.id) ?? 0)}
                            {!usesRarityDefaultWeight(prize) && (
                              <Badge variant="secondary">Custom</Badge>
                            )}
                          </span>
                        ) : (
                          <span className={clsx("text-muted-foreground")}>
                            Out of the draw
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StockMeter
                          remaining={prize.remainingQuantity}
                          total={prize.totalQuantity}
                        />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon-sm" />}
                          >
                            <MoreHorizontal />
                            <span className="sr-only">Open actions</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => onEditClick(prize)}
                            >
                              <Pencil />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onRestockClick(prize)}
                            >
                              <PackagePlus />
                              Restock
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setPrizeToDelete(prize)}
                            >
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={prizeToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPrizeToDelete(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete prize?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes{" "}
              <span className={clsx("font-medium")}>
                {prizeToDelete?.title}
              </span>{" "}
              from the lottery. Draws that already won it stay in history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting || !prizeToDelete}
              onClick={() => {
                if (!prizeToDelete) return;
                void onDelete(prizeToDelete.id).then(() =>
                  setPrizeToDelete(null),
                );
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
