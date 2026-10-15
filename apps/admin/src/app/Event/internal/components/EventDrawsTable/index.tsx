import type { FC } from "react";

import {
  formatBoothTicketNumber,
  parseBoothTicketRef,
} from "@dither-booth/shared/formatting";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Badge } from "@dither-booth/ui/components/ui/badge";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Input } from "@dither-booth/ui/components/ui/input";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dither-booth/ui/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { format } from "date-fns";
import { History, ListRestart, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useTRPC } from "#lib/trpc/trpc.client";

import { reportEventError } from "../../Event.utils";

export const EventDrawsTable: FC = () => {
  const trpc = useTRPC();
  const [draft, setDraft] = useState("");
  const [ticketRef, setTicketRef] = useState<string | undefined>(undefined);

  const listDrawsQuery = useQuery(
    trpc.config.listDraws.queryOptions(
      ticketRef ? { ticketRef, limit: 50 } : { limit: 50 },
    ),
  );

  useEffect(() => {
    if (!listDrawsQuery.error) return;
    reportEventError(
      listDrawsQuery.error,
      "list-draws-failed",
      "Failed to load draws.",
    );
  }, [listDrawsQuery.error]);

  const draws = listDrawsQuery.data?.draws ?? [];
  const isLookup = ticketRef !== undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="emerald">
            <History />
          </IconBubble>
          Draws
        </CardTitle>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-4")}>
        <form
          className={clsx("flex flex-wrap items-end gap-2")}
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            const trimmed = draft.trim();
            if (trimmed.length === 0) {
              setTicketRef(undefined);
              return;
            }

            const parsed = parseBoothTicketRef(trimmed);
            if (!parsed) {
              toast.error("Enter six digits or STUD_DITHERBOOTH_XXXXXX.");
              return;
            }

            setTicketRef(parsed);
          }}
        >
          <label className={clsx("flex min-w-56 flex-1 flex-col gap-1")}>
            <span className={clsx("text-sm font-medium")}>Ticket number</span>
            <Input
              value={draft}
              placeholder="STUD_DITHERBOOTH_000000"
              onChange={(changeEvent) => setDraft(changeEvent.target.value)}
            />
          </label>
          <Button type="submit">
            <Search data-icon="inline-start" />
            Look up
          </Button>
          {isLookup ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft("");
                setTicketRef(undefined);
              }}
            >
              <ListRestart data-icon="inline-start" />
              Show latest
            </Button>
          ) : null}
        </form>

        {listDrawsQuery.isLoading ? (
          <div className={clsx("flex min-h-32 items-center justify-center")}>
            <Spinner />
          </div>
        ) : listDrawsQuery.isError ? (
          <p className={clsx("text-sm text-destructive")}>
            Failed to load draws.
          </p>
        ) : draws.length === 0 ? (
          <p
            className={clsx(
              "rounded-lg border border-dashed px-4 py-8 text-center",
              "text-sm text-muted-foreground",
            )}
          >
            {isLookup
              ? "This ticket number is not on a draw."
              : "No draws yet."}
          </p>
        ) : (
          <div className={clsx("overflow-hidden rounded-lg border")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Prize</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draws.map((draw) => (
                  <TableRow key={draw.id}>
                    <TableCell className={clsx("font-mono tabular-nums")}>
                      {draw.ticketRef
                        ? formatBoothTicketNumber(draw.ticketRef)
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={clsx("text-muted-foreground tabular-nums")}
                    >
                      {format(new Date(draw.createdAt), "MMM d, HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      {draw.outcome === "win" ? (
                        <Badge
                          className={clsx(
                            "bg-success/10 text-success dark:bg-success/15",
                          )}
                          variant="secondary"
                        >
                          Win
                        </Badge>
                      ) : (
                        <Badge variant="outline">Loss</Badge>
                      )}
                    </TableCell>
                    <TableCell>{draw.prizeTitle ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
