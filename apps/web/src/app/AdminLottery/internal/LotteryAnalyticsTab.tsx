import { Badge } from "#components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#components/ui/table.tsx";
import { useTRPC } from "#lib/trpc/trpc.utils.ts";
import { useQuery } from "@tanstack/react-query";
import { type FC, type ReactNode } from "react";

export const LotteryAnalyticsTab: FC = () => {
  const trpc = useTRPC();

  const { data: analytics, isLoading: analyticsLoading } = useQuery(
    trpc.getLotteryAnalytics.queryOptions(),
  );
  const { data: trials, isLoading: trialsLoading } = useQuery(
    trpc.getLotteryEvents.queryOptions({ limit: 300 }),
  );
  const { data: lots } = useQuery(trpc.getLotteryLots.queryOptions());

  const isLoading = analyticsLoading || trialsLoading;

  if (isLoading && !analytics) {
    return <p className="p-4 text-xs text-muted-foreground">Loading…</p>;
  }

  if (!analytics) {
    return (
      <p className="p-4 text-xs text-muted-foreground">No data yet.</p>
    );
  }

  const totalRemaining = lots?.reduce((s, l) => s + l.stockRemaining, 0) ?? 0;
  const totalStock = lots?.reduce((s, l) => s + l.stockTotal, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Attempts" value={analytics.totalAttempts} />
        <StatCard
          label="Wins"
          value={analytics.wins}
          badge={
            <Badge variant="success">
              {(analytics.winRate * 100).toFixed(1)}%
            </Badge>
          }
        />
        <StatCard label="Losses" value={analytics.losses} />
        <StatCard
          label="Forced losses"
          value={analytics.forcedLosses}
          badge={
            analytics.forcedLosses > 0 ? (
              <Badge variant="destructive">
                {(analytics.forcedLossRate * 100).toFixed(1)}%
              </Badge>
            ) : undefined
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Abuse flagged" value={analytics.abuseDetectedCount} />
        <StatCard
          label="Stock remaining (live)"
          value={`${totalRemaining} / ${totalStock}`}
        />
      </div>

      {lots && lots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Stock by pool (current)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pool</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Left</TableHead>
                  <TableHead className="text-right">Given out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">{lot.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lot.stockTotal}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lot.stockRemaining}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lot.stockTotal - lot.stockRemaining}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {analytics.hourly.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By hour</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hour</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">Wins</TableHead>
                  <TableHead className="text-right">Losses</TableHead>
                  <TableHead className="text-right">Forced</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.hourly.map((row) => (
                  <TableRow key={row.hour}>
                    <TableCell className="font-mono">{row.hour}h</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.attempts}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.wins}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.losses}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.forcedLosses}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.attempts > 0
                        ? ((row.wins / row.attempts) * 100).toFixed(1) + "%"
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Draw log</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">#</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Pool</TableHead>
                <TableHead className="text-right">P(win)</TableHead>
                <TableHead className="text-right">ms capture→draw</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trials && trials.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No draws yet.
                  </TableCell>
                </TableRow>
              )}
              {trials?.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {t.id}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate font-mono text-[11px]">
                    {t.timestamp}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        t.outcome === "win"
                          ? "text-green-600 dark:text-green-400"
                          : t.outcome === "forced_loss"
                            ? "text-orange-600 dark:text-orange-400"
                            : ""
                      }
                    >
                      {t.outcome}
                    </span>
                    {t.abuseDetected ? (
                      <Badge variant="destructive" className="ml-1 text-[9px]">
                        abuse
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate text-xs">
                    {t.lotLabel ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px]">
                    {t.computedWinProbability != null
                      ? t.computedWinProbability.toFixed(4)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.captureToDrawMs ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const StatCard: FC<{
  label: string;
  value: number | string;
  badge?: ReactNode;
}> = (props) => {
  const { label, value, badge } = props;

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tabular-nums">{value}</span>
          {badge}
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </CardContent>
    </Card>
  );
};
