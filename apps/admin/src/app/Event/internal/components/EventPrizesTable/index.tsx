import type { FC } from "react";

import { capitalize } from "@dither-booth/shared/formatting";
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
  CardDescription,
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
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import type { CurrentEvent, EventPrize } from "../../Event.types";

interface EventPrizesTableProps {
  event: CurrentEvent;
  isDeleting: boolean;
  onAddClick: () => void;
  onEditClick: (prize: EventPrize) => void;
  onRestockClick: (prize: EventPrize) => void;
  onDelete: (prizeId: string) => Promise<void>;
}

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
        <CardHeader
          className={clsx("flex flex-row items-start justify-between gap-4")}
        >
          <div>
            <CardTitle>Prizes</CardTitle>
            <CardDescription>
              Prizes available in the event lottery. Delete is blocked once a
              prize has draw history.
            </CardDescription>
          </div>
          <Button onClick={onAddClick}>Add prize</Button>
        </CardHeader>
        <CardContent>
          {event.prizes.length === 0 ? (
            <p className={clsx("text-sm text-muted-foreground")}>
              No prizes yet. Add the first prize to start stocking the lottery.
            </p>
          ) : (
            <div className={clsx("overflow-hidden rounded-none border")}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Rarity</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className={clsx("w-12")} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {event.prizes.map((prize) => (
                    <TableRow key={prize.id}>
                      <TableCell>{prize.title}</TableCell>
                      <TableCell>{capitalize(prize.rarity)}</TableCell>
                      <TableCell>{prize.weight}</TableCell>
                      <TableCell>{prize.remainingQuantity}</TableCell>
                      <TableCell>{prize.totalQuantity}</TableCell>
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
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onRestockClick(prize)}
                            >
                              Restock
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setPrizeToDelete(prize)}
                            >
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
              from the lottery. Prizes with draw history cannot be deleted.
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
