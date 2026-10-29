import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { notify } from "#lib/feedback/notify";

import type { PowerAction } from "./power.protocol";
import type { PowerPhase } from "./power.utils";

import {
  fetchPowerAvailable,
  isAdminAnswering,
  requestPowerAction,
} from "./power.client";
import { POWER_POLL_INTERVAL_MS } from "./power.constants";
import { advancePowerPhase, startWaiting } from "./power.utils";

/**
 * The Power panel: whether the booth offers the actions, the one in
 * progress, and a way to run one. While a restart, reboot or power off
 * runs it probes the admin until it is back, or off.
 */
export const usePowerControl = () => {
  const availability = useQuery({
    queryKey: ["power"],
    queryFn: ({ signal }) => fetchPowerAvailable(signal),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [phase, setPhase] = useState<PowerPhase>({ kind: "idle" });

  const run = useCallback(async (action: PowerAction) => {
    setPhase({ kind: "sending", action });

    const result = await requestPowerAction(action);

    if (result.ok) {
      setPhase(startWaiting(action, Date.now()));
    } else {
      setPhase({ kind: "failed", action, message: result.message });
      notify.error(result.message);
    }
  }, []);

  const reset = useCallback(() => setPhase({ kind: "idle" }), []);

  const isWaiting = phase.kind === "waiting";

  useEffect(() => {
    if (!isWaiting) return;

    let cancelled = false;
    let probing = false;
    const timer = setInterval(async () => {
      if (probing) return;
      probing = true;

      const answered = await isAdminAnswering();

      probing = false;
      if (cancelled) return;

      setPhase((current) =>
        current.kind === "waiting"
          ? advancePowerPhase(current, { answered, at: Date.now() })
          : current,
      );
    }, POWER_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isWaiting]);

  // Back is news, not a state: say it, then the panel is ready again.
  useEffect(() => {
    if (phase.kind !== "back") return;

    notify.success("The booth is back.");
    setPhase({ kind: "idle" });
  }, [phase.kind]);

  return {
    available: availability.data,
    isCheckingAvailability: availability.isPending,
    phase,
    run,
    reset,
  };
};
