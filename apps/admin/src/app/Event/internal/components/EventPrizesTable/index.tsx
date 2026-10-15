import type { FC } from "react";

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
    <div className={clsx("flex min-w-28 items-center gap-2")}>
      <span className={clsx("w-14 text-sm tabular-nums")}>
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className={clsx("flex items-center gap-2")}>
            <Gift className={clsx("size-4 text-muted-foreground")} />
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
            <p className={clsx("text-sm text-muted-foreground")}>
              No prizes yet.
            </p>
          ) : (
            <div className={clsx("overflow-hidden rounded-lg border")}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Rarity</TableHead>
                    <TableHead>Weight</TableHead>
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
                      <TableCell className={clsx("tabular-nums")}>
                        {prize.weight}
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
