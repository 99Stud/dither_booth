import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { notify } from "#lib/feedback/notify";

import type { UpdateRequest, UpdateSnapshot } from "./update.protocol";

import { fetchUpdateSnapshot, requestUpdateAction } from "./update.client";
import { UPDATE_POLL_ACTIVE_MS, UPDATE_POLL_IDLE_MS } from "./update.constants";

export const UPDATE_QUERY_KEY = ["update"] as const;

/** How long an accepted request may go without its job appearing. */
const PENDING_TIMEOUT_MS = 60_000;

/** A request the booth accepted, until its job shows up in the snapshot. */
export type PendingUpdate = { request: UpdateRequest; jobId: string | null };

const isRunning = (snapshot: UpdateSnapshot | null | undefined) =>
  snapshot?.job?.state === "running";

/**
 * The Software panel's state. While a job runs it reads every 3 s, and
 * keeps reading while the admin server restarts under it. Once the
 * server answers with another release, this page's code is the old
 * one's: it reloads.
 */
export const useUpdateState = () => {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [isSending, setIsSending] = useState(false);
  const query = useQuery({
    queryKey: UPDATE_QUERY_KEY,
    queryFn: ({ signal }) => fetchUpdateSnapshot(signal),
    refetchInterval: (current) =>
      pending || isRunning(current.state.data) || current.state.error
        ? UPDATE_POLL_ACTIVE_MS
        : UPDATE_POLL_IDLE_MS,
    refetchIntervalInBackground: true,
    retry: false,
  });
  const snapshot = query.data;
  const loadedRelease = useRef<string | null>(null);

  useEffect(() => {
    if (!snapshot) return;
    loadedRelease.current ??= snapshot.release;
    if (snapshot.release !== loadedRelease.current) window.location.reload();
  }, [snapshot]);

  // The request is over once a new job is on the booth, or ran and ended.
  useEffect(() => {
    if (!pending || !snapshot?.job) return;
    if (snapshot.job.jobId !== pending.jobId) setPending(null);
  }, [pending, snapshot]);

  // A unit that started but never wrote a job: say so rather than wait.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      setPending(null);
      notify.warning(
        "The booth didn't start it. Its log is on the Logs page, under System.",
      );
    }, PENDING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const run = useCallback(
    async (request: UpdateRequest) => {
      setIsSending(true);
      const jobId = snapshot?.job?.jobId ?? null;
      const result = await requestUpdateAction(request);
      setIsSending(false);

      if (!result.ok) {
        notify.error(result.message);
        return;
      }

      queryClient.setQueryData(UPDATE_QUERY_KEY, result.snapshot);
      if (request.action !== "check") setPending({ request, jobId });
    },
    [queryClient, snapshot?.job?.jobId],
  );

  return {
    snapshot,
    isPending: query.isPending,
    /** The server didn't answer the last read: restarting, or gone. */
    isUnreachable: query.isError,
    isSending,
    pending,
    run,
  };
};
