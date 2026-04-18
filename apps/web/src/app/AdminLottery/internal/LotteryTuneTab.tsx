import { Button } from "#components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#components/ui/dialog.tsx";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field.tsx";
import { Input } from "#components/ui/input.tsx";
import { Progress } from "#components/ui/progress.tsx";
import { Spinner } from "#components/ui/spinner.tsx";
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
import { CheckCircle2 } from "lucide-react";
import { type FC, useCallback, useState } from "react";

export const LotteryTuneTab: FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const tuneLottery = useMutation(trpc.tuneLottery.mutationOptions());
  const updateConfig = useMutation(trpc.updateLotteryConfig.mutationOptions());
  const patchLot = useMutation(trpc.updateLotteryLot.mutationOptions());
  const { data: lots } = useQuery(trpc.getLotteryLots.queryOptions());

  const [samples, setSamples] = useState(15_000);
  const [attempts, setAttempts] = useState(135);
  const [seed, setSeed] = useState(20);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applied, setApplied] = useState(false);

  const result = tuneLottery.data;
  const rec = result?.recommended ?? null;
  const best = result?.top[0] ?? null;

  const isApplying = updateConfig.isPending || patchLot.isPending;

  const handleApply = useCallback(async () => {
    if (!rec) return;
    await updateConfig.mutateAsync({
      baseWinPressure: rec.baseWinPressure,
      maxBoost: rec.maxBoost,
    });
    for (const l of rec.lots) {
      await patchLot.mutateAsync({ id: l.id, baseWeight: l.baseWeight });
    }
    await queryClient.invalidateQueries(trpc.getLotteryConfig.queryOptions());
    await queryClient.invalidateQueries(trpc.getLotteryLots.queryOptions());
    setApplyOpen(false);
    setApplied(true);
  }, [rec, updateConfig, patchLot, queryClient, trpc]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Current lots</CardTitle>
          <CardDescription>
            Lots that will be used as input for the search.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-xs text-muted-foreground">
          {lots && lots.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Rarity</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Current weight</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
                  .map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.label}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {l.rarity.replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.stockTotal}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.baseWeight}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground">
              No prize pools. Add some under the Lots tab.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search parameters</CardTitle>
          <CardDescription>
            Controls how the optimizer explores the config space.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="tune-samples">Samples</FieldLabel>
              <FieldDescription>
                How many random candidate configs to try. Each sample picks random base pressure,
                max boost, and rarity weights, then scores the result.
              </FieldDescription>
              <Input
                id="tune-samples"
                type="number"
                min={1}
                max={25_000}
                value={samples}
                onChange={(e) => setSamples(Number(e.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tune-attempts">Attempts per simulation</FieldLabel>
              <FieldDescription>
                Length of each offline simulation run used to score a candidate (same engine as the
                Simulation tab, "normal" traffic).
              </FieldDescription>
              <Input
                id="tune-attempts"
                type="number"
                min={10}
                max={10_000}
                value={attempts}
                onChange={(e) => setAttempts(Number(e.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tune-seed">Random seed</FieldLabel>
              <FieldDescription>
                Seeds the RNG that generates random candidates so runs are reproducible when inputs
                are unchanged.
              </FieldDescription>
              <Input
                id="tune-seed"
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => {
                setApplied(false);
                tuneLottery.mutate({ samples, attempts, seed });
              }}
              disabled={tuneLottery.isPending || !lots?.length}
            >
              {tuneLottery.isPending ? (
                <>
                  <Spinner className="mr-2" />
                  Running…
                </>
              ) : (
                "Run optimization"
              )}
            </Button>
            {tuneLottery.isError ? (
              <span className="text-xs text-destructive">
                Run failed. Try fewer samples or a shorter simulation.
              </span>
            ) : null}
          </div>
          {tuneLottery.isPending ? (
            <div className="flex flex-col gap-1.5">
              <Progress indeterminate />
              <p className="text-xs text-muted-foreground">Optimizing…</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {rec && best ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle>Best candidate</CardTitle>
                <CardDescription>
                  Rank #1 out of {result?.samples ?? 0} samples — score{" "}
                  {best.score.toFixed(0)}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {applied ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 className="size-3.5" />
                    Applied
                  </span>
                ) : null}
                <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
                  <DialogTrigger
                    render={
                      <Button variant="default" size="sm" disabled={isApplying} />
                    }
                  >
                    Apply to live config
                  </DialogTrigger>
                  <DialogContent showCloseButton={false}>
                    <DialogHeader>
                      <DialogTitle>Apply recommended config?</DialogTitle>
                      <DialogDescription>
                        This will overwrite the live lottery&apos;s win pressure, max boost, and
                        all lot weights. The next draw will use the new values.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2 rounded-none border bg-muted/40 p-3 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-muted-foreground">Win pressure</div>
                        <div className="font-mono font-medium">
                          {rec.baseWinPressure.toFixed(4)}
                        </div>
                        <div className="text-muted-foreground">Max boost</div>
                        <div className="font-mono font-medium">
                          {rec.maxBoost.toFixed(2)}×
                        </div>
                      </div>
                      {rec.lots.length > 0 ? (
                        <div className="mt-2 border-t pt-2">
                          <div className="mb-1.5 text-muted-foreground">Lot weights</div>
                          <div className="flex flex-col gap-1">
                            {rec.lots.map((l) => {
                              const current = lots?.find((lot) => lot.id === l.id);
                              return (
                                <div key={l.id} className="grid grid-cols-[1fr_auto_auto] gap-2">
                                  <span className="truncate">{l.label}</span>
                                  {current ? (
                                    <span className="text-muted-foreground tabular-nums">
                                      {current.baseWeight}
                                    </span>
                                  ) : null}
                                  <span className="font-mono font-medium tabular-nums">
                                    → {l.baseWeight.toFixed(4)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <DialogFooter showCloseButton>
                      <Button
                        onClick={handleApply}
                        disabled={isApplying}
                      >
                        {isApplying ? (
                          <>
                            <Spinner className="mr-2" />
                            Applying…
                          </>
                        ) : (
                          "Confirm & apply"
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Win pressure" value={rec.baseWinPressure.toFixed(4)} />
              <Stat label="Max boost" value={`${rec.maxBoost.toFixed(2)}×`} />
              <Stat
                label="Hourly rate σ"
                value={best.hourlyWinRateStd.toFixed(4)}
              />
              <Stat
                label="All pools empty"
                value={best.allLotsDistributed ? "Yes" : "No"}
                muted={!best.allLotsDistributed}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Recommended lot weights
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pool</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Recommended</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rec.lots.map((l) => {
                    const current = lots?.find((lot) => lot.id === l.id);
                    const delta = current
                      ? l.baseWeight - current.baseWeight
                      : null;
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.label}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {current?.baseWeight ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {l.baseWeight.toFixed(4)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums text-xs ${
                            delta == null
                              ? ""
                              : delta > 0
                                ? "text-green-600 dark:text-green-400"
                                : delta < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                          }`}
                        >
                          {delta == null
                            ? "—"
                            : delta === 0
                              ? "—"
                              : `${delta > 0 ? "+" : ""}${delta.toFixed(4)}`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result && result.top.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Top 20</CardTitle>
            <CardDescription>
              Ranked by optimization score (higher is better).
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Pressure</TableHead>
                  <TableHead className="text-right">Boost</TableHead>
                  <TableHead className="text-right">Rate σ</TableHead>
                  <TableHead>Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.top.map((row) => (
                  <TableRow key={row.rank} className={row.rank === 1 ? "bg-muted/50" : ""}>
                    <TableCell className="tabular-nums font-medium">{row.rank}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.score.toFixed(0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.baseWinPressure.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.maxBoost.toFixed(2)}×
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.hourlyWinRateStd.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.allLotsDistributed ? (
                        <span className="text-green-600 dark:text-green-400">All empty</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {row.totalRemainingStock} left
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

const Stat: FC<{ label: string; value: string; muted?: boolean }> = (props) => {
  const { label, value, muted } = props;
  return (
    <div className="flex flex-col gap-1 rounded-none border bg-muted/30 px-3 py-2">
      <span
        className={`text-sm font-semibold tabular-nums ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
};
