import type { FC } from "react";

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
import { capitalize } from "@dither-booth/shared/formatting";
import clsx from "clsx";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import type { CurrentEvent, EventLot } from "../../Event.types";

interface EventLotsTableProps {
  event: CurrentEvent;
  isDeleting: boolean;
  onAddClick: () => void;
  onEditClick: (lot: EventLot) => void;
  onRestockClick: (lot: EventLot) => void;
  onDelete: (lotId: string) => Promise<void>;
}

export const EventLotsTable: FC<EventLotsTableProps> = (props) => {
  const {
    event,
    isDeleting,
    onAddClick,
    onEditClick,
    onRestockClick,
    onDelete,
  } = props;

  const [lotToDelete, setLotToDelete] = useState<EventLot | null>(null);

  return (
    <>
      <Card>
        <CardHeader
          className={clsx("flex flex-row items-start justify-between gap-4")}
        >
          <div>
            <CardTitle>Lots</CardTitle>
            <CardDescription>
              Prizes available in the event lottery. Delete is blocked once a
              lot has draw history.
            </CardDescription>
          </div>
          <Button onClick={onAddClick}>Add lot</Button>
        </CardHeader>
        <CardContent>
          {event.lots.length === 0 ? (
            <p className={clsx("text-sm text-muted-foreground")}>
              No lots yet. Add the first prize to start stocking the lottery.
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
                  {event.lots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell>{lot.title}</TableCell>
                      <TableCell>{capitalize(lot.rarity)}</TableCell>
                      <TableCell>{lot.weight}</TableCell>
                      <TableCell>{lot.remainingQuantity}</TableCell>
                      <TableCell>{lot.totalQuantity}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-sm" />
                            }
                          >
                            <MoreHorizontal />
                            <span className="sr-only">Open actions</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => onEditClick(lot)}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onRestockClick(lot)}
                            >
                              Restock
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setLotToDelete(lot)}
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
        open={lotToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setLotToDelete(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lot?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes{" "}
              <span className={clsx("font-medium")}>
                {lotToDelete?.title}
              </span>{" "}
              from the lottery. Lots with draw history cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting || !lotToDelete}
              onClick={() => {
                if (!lotToDelete) return;
                void onDelete(lotToDelete.id).then(() => setLotToDelete(null));
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
