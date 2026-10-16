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
import { haptic } from "@dither-booth/ui/haptics";
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

import { RarityBadge, RarityDot } from "#components/Misc/RarityBadge/index";

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

/** Edit, restock or delete: the "…" menu on each prize. */
const PrizeActions: FC<{
  prize: EventPrize;
  onEdit: (prize: EventPrize) => void;
  onRestock: (prize: EventPrize) => void;
  onDelete: (prize: EventPrize) => void;
}> = ({ prize, onEdit, onRestock, onDelete }) => (
  <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
      <MoreHorizontal />
      <span className="sr-only">Open actions</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => onEdit(prize)}>
        <Pencil />
        Edit
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onRestock(prize)}>
        <PackagePlus />
        Restock
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onClick={() => onDelete(prize)}>
        <Trash2 />
        Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

/** "1 in 13", flagged when set per prize, or out of the draw. */
const PrizeChance: FC<{ prize: EventPrize; chance: number | undefined }> = ({
  prize,
  chance,
}) =>
  chance === undefined ? (
    <span className={clsx("text-muted-foreground")}>Out of the draw</span>
  ) : (
    <span className={clsx("inline-flex items-center gap-1.5 tabular-nums")}>
      {formatOneIn(chance)}
      {!usesRarityDefaultWeight(prize) && (
        <Badge variant="secondary">Custom</Badge>
      )}
    </span>
  );

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
  // A destructive step ahead: warn by touch as the confirmation opens.
  const askToDelete = (prize: EventPrize) => {
    haptic("warning");
    setPrizeToDelete(prize);
  };
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
            <>
              {/* Phones: the card is the inset group, a row per prize; tap one to edit it. */}
              <ul className={clsx("-mx-4 -mb-4 divide-y border-t md:hidden")}>
                {event.prizes.map((prize) => (
                  <li key={prize.id} className={clsx("flex items-center")}>
                    <button
                      type="button"
                      className={clsx(
                        "flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left",
                        "transition-colors active:bg-muted",
                      )}
                      onClick={() => onEditClick(prize)}
                    >
                      <RarityDot
                        rarity={prize.rarity}
                        className="size-2.5 shrink-0 rounded-full"
                      />
                      <span
                        className={clsx("flex min-w-0 flex-1 flex-col gap-0.5")}
                      >
                        <span className={clsx("truncate font-medium")}>
                          {prize.title}
                        </span>
                        <span
                          className={clsx(
                            "flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground",
                          )}
                        >
                          <PrizeChance
                            prize={prize}
                            chance={chanceById.get(prize.id)}
                          />
                          <span aria-hidden>·</span>
                          <span className={clsx("tabular-nums")}>
                            {prize.remainingQuantity} of {prize.totalQuantity}{" "}
                            left
                          </span>
                        </span>
                      </span>
                    </button>
                    <div className={clsx("pr-1.5")}>
                      <PrizeActions
                        prize={prize}
                        onEdit={onEditClick}
                        onRestock={onRestockClick}
                        onDelete={askToDelete}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <div
                className={clsx(
                  "hidden overflow-hidden rounded-lg border md:block",
                )}
              >
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
                          <PrizeChance
                            prize={prize}
                            chance={chanceById.get(prize.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <StockMeter
                            remaining={prize.remainingQuantity}
                            total={prize.totalQuantity}
                          />
                        </TableCell>
                        <TableCell>
                          <PrizeActions
                            prize={prize}
                            onEdit={onEditClick}
                            onRestock={onRestockClick}
                            onDelete={askToDelete}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
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
