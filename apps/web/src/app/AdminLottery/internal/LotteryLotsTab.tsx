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
import { type FC, useCallback, useState } from "react";

const lotSelectClassName =
  "h-8 w-full min-w-[7.5rem] border border-input bg-background px-2 text-xs";

const RARITY_OPTIONS = [
  { value: "common", label: "Common" },
  { value: "medium", label: "Medium" },
  { value: "rare", label: "Rare" },
  { value: "very_rare", label: "Very rare" },
] as const;

type EditableLotFields = {
  id: number;
  stockTotal: number;
  stockRemaining: number;
  baseWeight: number;
  rarity: string;
};

export const LotteryLotsTab: FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: lots, isLoading } = useQuery(
    trpc.getLotteryLots.queryOptions(),
  );
  const { data: presets } = useQuery(trpc.getLotteryPresets.queryOptions());
  const createLot = useMutation(trpc.createLotteryLot.mutationOptions());
  const patchLot = useMutation(trpc.updateLotteryLot.mutationOptions());
  const deleteLot = useMutation(trpc.deleteLotteryLot.mutationOptions());
  const savePreset = useMutation(trpc.saveLotteryPreset.mutationOptions());
  const applyPreset = useMutation(trpc.applyLotteryPreset.mutationOptions());

  const [newLot, setNewLot] = useState({
    label: "",
    stockTotal: 1,
    baseWeight: 1,
    rarity: "common" as string,
  });
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<number | "">("");

  const invalidateLots = useCallback(async () => {
    await queryClient.invalidateQueries(trpc.getLotteryLots.queryOptions());
    await queryClient.invalidateQueries(trpc.getLotteryPresets.queryOptions());
  }, [queryClient, trpc]);

  const handleSavePreset = useCallback(async () => {
    if (!presetName.trim()) return;
    await savePreset.mutateAsync({ name: presetName.trim() });
    setPresetName("");
    await invalidateLots();
  }, [invalidateLots, presetName, savePreset]);

  const handleApplyPreset = useCallback(async () => {
    if (selectedPresetId === "") return;
    await applyPreset.mutateAsync({ presetId: selectedPresetId });
    setSelectedPresetId("");
    await invalidateLots();
  }, [applyPreset, invalidateLots, selectedPresetId]);

  const handleCreate = useCallback(async () => {
    if (!newLot.label.trim()) return;
    await createLot.mutateAsync({
      label: newLot.label.trim(),
      stockTotal: newLot.stockTotal,
      baseWeight: newLot.baseWeight,
      rarity: newLot.rarity as "common" | "medium" | "rare" | "very_rare",
    });
    setNewLot({ label: "", stockTotal: 1, baseWeight: 1, rarity: "common" });
    await invalidateLots();
  }, [newLot, createLot, invalidateLots]);

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteLot.mutateAsync({ id });
      await invalidateLots();
    },
    [deleteLot, invalidateLots],
  );

  const handleResetStock = useCallback(
    async (id: number, stockTotal: number) => {
      await patchLot.mutateAsync({ id, stockRemaining: stockTotal });
      await invalidateLots();
    },
    [patchLot, invalidateLots],
  );

  const clampInt = useCallback((n: number, min: number, max: number) => {
    return Math.min(max, Math.max(min, Math.floor(n)));
  }, []);

  const handlePatchLot = useCallback(
    async (
      lot: EditableLotFields,
      patch: {
        stockTotal?: number;
        stockRemaining?: number;
        baseWeight?: number;
        rarity?: "common" | "medium" | "rare" | "very_rare";
      },
    ) => {
      await patchLot.mutateAsync({ id: lot.id, ...patch });
      await invalidateLots();
    },
    [patchLot, invalidateLots],
  );

  if (isLoading) {
    return <p className="p-4 text-xs text-muted-foreground">Loading…</p>;
  }

  const totalStock = lots?.reduce((s, l) => s + l.stockTotal, 0) ?? 0;
  const totalRemaining = lots?.reduce((s, l) => s + l.stockRemaining, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden border-border bg-card/95 shadow-lg ring-1 ring-black/15 backdrop-blur-md dark:ring-white/10">
        <CardHeader className="space-y-2 border-b border-border/70 bg-muted/50 py-4">
          <CardTitle className="text-sm text-foreground">Inventory</CardTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Total units:{" "}
              <strong className="font-semibold text-foreground">
                {totalStock}
              </strong>
            </span>
            <span>
              Remaining:{" "}
              <strong className="font-semibold text-foreground">
                {totalRemaining}
              </strong>
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rarity</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Left</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots && lots.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No prize pools yet. Add one below.
                  </TableCell>
                </TableRow>
              )}
              {lots?.map((lot) => (
                <TableRow key={lot.id}>
                  <TableCell className="font-medium">{lot.label}</TableCell>
                  <TableCell className="min-w-34">
                    <select
                      className={lotSelectClassName}
                      disabled={patchLot.isPending}
                      value={lot.rarity}
                      onChange={(e) => {
                        const rarity = e.target.value as
                          | "common"
                          | "medium"
                          | "rare"
                          | "very_rare";
                        if (rarity === lot.rarity) return;
                        void handlePatchLot(lot, { rarity });
                      }}
                      aria-label={`Rarity for ${lot.label}`}
                    >
                      {RARITY_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="ml-auto h-8 w-18 tabular-nums"
                      disabled={patchLot.isPending}
                      defaultValue={lot.baseWeight}
                      key={`bw-${lot.id}-${lot.baseWeight}`}
                      type="number"
                      step={0.1}
                      min={0.01}
                      max={100}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === "") {
                          e.target.value = String(lot.baseWeight);
                          return;
                        }
                        const v = Number(raw);
                        if (Number.isNaN(v)) {
                          e.target.value = String(lot.baseWeight);
                          return;
                        }
                        const baseWeight = Math.min(100, Math.max(0.01, v));
                        if (baseWeight === lot.baseWeight) return;
                        void handlePatchLot(lot, { baseWeight });
                      }}
                      aria-label={`Weight for ${lot.label}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="ml-auto h-8 w-18 tabular-nums"
                      disabled={patchLot.isPending}
                      defaultValue={lot.stockTotal}
                      key={`st-${lot.id}-${lot.stockTotal}`}
                      type="number"
                      min={1}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === "") {
                          e.target.value = String(lot.stockTotal);
                          return;
                        }
                        const v = Number(raw);
                        if (Number.isNaN(v)) {
                          e.target.value = String(lot.stockTotal);
                          return;
                        }
                        const stockTotal = clampInt(v, 1, 1_000_000);
                        if (stockTotal === lot.stockTotal) return;
                        const stockRemaining = Math.min(lot.stockRemaining, stockTotal);
                        void handlePatchLot(lot, { stockTotal, stockRemaining });
                      }}
                      aria-label={`Total stock for ${lot.label}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className={`ml-auto h-8 w-18 tabular-nums ${
                        lot.stockRemaining === 0 ? "text-destructive" : ""
                      }`}
                      disabled={patchLot.isPending}
                      defaultValue={lot.stockRemaining}
                      key={`sr-${lot.id}-${lot.stockRemaining}-${lot.stockTotal}`}
                      type="number"
                      min={0}
                      max={lot.stockTotal}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === "") {
                          e.target.value = String(lot.stockRemaining);
                          return;
                        }
                        const v = Number(raw);
                        if (Number.isNaN(v)) {
                          e.target.value = String(lot.stockRemaining);
                          return;
                        }
                        const stockRemaining = clampInt(v, 0, lot.stockTotal);
                        if (stockRemaining === lot.stockRemaining) return;
                        void handlePatchLot(lot, { stockRemaining });
                      }}
                      aria-label={`Remaining stock for ${lot.label}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleResetStock(lot.id, lot.stockTotal)}
                        title="Restock"
                        disabled={patchLot.isPending}
                      >
                        ↺
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(lot.id)}
                        title="Delete"
                        disabled={patchLot.isPending}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add prize pool</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="new-lot-label">Name</FieldLabel>
            <Input
              id="new-lot-label"
              value={newLot.label}
              onChange={(e) =>
                setNewLot((f) => ({ ...f, label: e.target.value }))
              }
              placeholder="e.g. Merch pack"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="new-lot-stock">Stock</FieldLabel>
              <FieldDescription>How many of this prize can be won in total.</FieldDescription>
              <Input
                id="new-lot-stock"
                type="number"
                min="1"
                value={newLot.stockTotal}
                onChange={(e) =>
                  setNewLot((f) => ({
                    ...f,
                    stockTotal: Number(e.target.value),
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-lot-weight">Weight</FieldLabel>
              <FieldDescription>
                Relative chance when a win picks a lot: weights are compared only among lots that
                still have stock.
              </FieldDescription>
              <Input
                id="new-lot-weight"
                type="number"
                step="0.1"
                min="0.01"
                value={newLot.baseWeight}
                onChange={(e) =>
                  setNewLot((f) => ({
                    ...f,
                    baseWeight: Number(e.target.value),
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-lot-rarity">Rarity</FieldLabel>
              <FieldDescription>
                Used for display and for optimization presets; it does not change draw logic by
                itself.
              </FieldDescription>
              <select
                id="new-lot-rarity"
                className="h-9 w-full border border-input bg-transparent px-2 text-xs"
                value={newLot.rarity}
                onChange={(e) =>
                  setNewLot((f) => ({ ...f, rarity: e.target.value }))
                }
              >
                {RARITY_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button
            onClick={handleCreate}
            disabled={createLot.isPending || !newLot.label.trim()}
            className="self-end"
          >
            Add
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Presets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <Field className="min-w-[180px] flex-1">
              <FieldLabel htmlFor="preset-name">Preset name</FieldLabel>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g. Default 2026 lineup"
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSavePreset}
              disabled={savePreset.isPending || !presetName.trim()}
            >
              {savePreset.isPending ? "…" : "Save preset"}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field className="min-w-[200px] flex-1">
              <FieldLabel htmlFor="preset-apply">Apply preset</FieldLabel>
              <FieldDescription>
                Replaces all lots with the snapshot stored in this preset.
              </FieldDescription>
              <select
                id="preset-apply"
                className="h-9 w-full border border-input bg-transparent px-2 text-xs"
                value={selectedPresetId === "" ? "" : String(selectedPresetId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedPresetId(v === "" ? "" : Number(v));
                }}
              >
                <option value="">— Select —</option>
                {presets?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (#{p.id})
                  </option>
                ))}
              </select>
            </Field>
            <Button
              type="button"
              onClick={handleApplyPreset}
              disabled={
                applyPreset.isPending || selectedPresetId === "" || presets?.length === 0
              }
            >
              {applyPreset.isPending ? "…" : "Apply"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
