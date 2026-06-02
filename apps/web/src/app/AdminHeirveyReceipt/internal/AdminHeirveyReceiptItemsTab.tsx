import { Button } from "#components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#components/ui/card.tsx";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field.tsx";
import { Input } from "#components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#components/ui/table.tsx";
import { useTRPC } from "#lib/trpc/trpc.utils.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { type FC, useCallback, useEffect, useState } from "react";

type AdminHeirveyReceiptItemsTabProps = {
  onMutatingChange?: (mutating: boolean) => void;
};

type ItemRow = {
  id: number;
  label: string;
  qty: number;
  price: number;
};

export const AdminHeirveyReceiptItemsTab: FC<AdminHeirveyReceiptItemsTabProps> = (
  props,
) => {
  const { onMutatingChange } = props;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useQuery(trpc.getItems.queryOptions());
  const createItem = useMutation(trpc.createItem.mutationOptions());
  const updateItem = useMutation(trpc.updateItem.mutationOptions());
  const deleteItem = useMutation(trpc.deleteItem.mutationOptions());

  const [newItem, setNewItem] = useState({
    label: "",
    qty: 1,
    price: 0,
  });

  const isMutating =
    createItem.isPending || updateItem.isPending || deleteItem.isPending;

  useEffect(() => {
    onMutatingChange?.(isMutating);
  }, [isMutating, onMutatingChange]);

  const invalidateItems = useCallback(async () => {
    await queryClient.invalidateQueries(trpc.getItems.queryOptions());
  }, [queryClient, trpc]);

  const handleCreate = useCallback(async () => {
    if (!newItem.label.trim()) return;
    await createItem.mutateAsync({
      label: newItem.label.trim(),
      qty: newItem.qty,
      price: newItem.price,
    });
    setNewItem({ label: "", qty: 1, price: 0 });
    await invalidateItems();
  }, [createItem, invalidateItems, newItem]);

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteItem.mutateAsync({ id });
      await invalidateItems();
    },
    [deleteItem, invalidateItems],
  );

  const handlePatchItem = useCallback(
    async (
      item: ItemRow,
      patch: { label?: string; qty?: number; price?: number },
    ) => {
      await updateItem.mutateAsync({ id: item.id, ...patch });
      await invalidateItems();
    },
    [invalidateItems, updateItem],
  );

  const clampInt = useCallback((n: number, min: number, max: number) => {
    return Math.min(max, Math.max(min, Math.floor(n)));
  }, []);

  if (isLoading) {
    return <p className="p-4 text-xs text-muted-foreground">Loading…</p>;
  }

  const totalPrice = items?.reduce((sum, row) => sum + row.price, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden border-border bg-card/95 shadow-lg ring-1 ring-black/15 backdrop-blur-md dark:ring-white/10">
        <CardHeader className="space-y-2 border-b border-border/70 bg-muted/50 py-4">
          <CardTitle className="text-sm text-foreground">Line items</CardTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Items:{" "}
              <strong className="font-semibold text-foreground">
                {items?.length ?? 0}
              </strong>
            </span>
            <span>
              Total:{" "}
              <strong className="font-semibold text-foreground">
                {totalPrice}€
              </strong>
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items && items.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={4}
                  >
                    No line items yet. Add one below.
                  </TableCell>
                </TableRow>
              )}
              {items?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-40 max-w-64">
                    <Input
                      className="h-8 w-full min-w-0 font-medium"
                      defaultValue={item.label}
                      disabled={isMutating}
                      key={`label-${item.id}-${item.label}`}
                      maxLength={200}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === "") {
                          e.target.value = item.label;
                          return;
                        }
                        if (raw === item.label) return;
                        void handlePatchItem(item, { label: raw });
                      }}
                      aria-label={`Label for item ${item.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="ml-auto h-8 w-18 tabular-nums"
                      disabled={isMutating}
                      defaultValue={item.qty}
                      key={`qty-${item.id}-${item.qty}`}
                      type="number"
                      min={1}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === "") {
                          e.target.value = String(item.qty);
                          return;
                        }
                        const v = Number(raw);
                        if (Number.isNaN(v)) {
                          e.target.value = String(item.qty);
                          return;
                        }
                        const qty = clampInt(v, 1, 1_000_000);
                        if (qty === item.qty) return;
                        void handlePatchItem(item, { qty });
                      }}
                      aria-label={`Quantity for ${item.label}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="ml-auto h-8 w-18 tabular-nums"
                      disabled={isMutating}
                      defaultValue={item.price}
                      key={`price-${item.id}-${item.price}`}
                      type="number"
                      min={0}
                      step={0.01}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === "") {
                          e.target.value = String(item.price);
                          return;
                        }
                        const v = Number(raw);
                        if (Number.isNaN(v)) {
                          e.target.value = String(item.price);
                          return;
                        }
                        const price = Math.max(0, v);
                        if (price === item.price) return;
                        void handlePatchItem(item, { price });
                      }}
                      aria-label={`Price for ${item.label}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDelete(item.id)}
                      title="Delete"
                      disabled={isMutating}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add line item</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="new-item-label">Label</FieldLabel>
            <Input
              id="new-item-label"
              value={newItem.label}
              onChange={(e) =>
                setNewItem((f) => ({ ...f, label: e.target.value }))
              }
              placeholder="e.g. 99Stud"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="new-item-qty">Qty</FieldLabel>
              <FieldDescription>
                Shown on the receipt as e.g. 2x (display only; total uses line
                price).
              </FieldDescription>
              <Input
                id="new-item-qty"
                type="number"
                min="1"
                value={newItem.qty}
                onChange={(e) =>
                  setNewItem((f) => ({
                    ...f,
                    qty: Number(e.target.value),
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-item-price">Price</FieldLabel>
              <FieldDescription>
                Line amount printed on the right of the row.
              </FieldDescription>
              <Input
                id="new-item-price"
                type="number"
                min="0"
                step="0.01"
                value={newItem.price}
                onChange={(e) =>
                  setNewItem((f) => ({
                    ...f,
                    price: Number(e.target.value),
                  }))
                }
              />
            </Field>
          </div>
          <Button
            onClick={() => void handleCreate()}
            disabled={createItem.isPending || !newItem.label.trim()}
            className="self-end"
          >
            Add
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
