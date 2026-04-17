import { Button } from "#components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#components/ui/card.tsx";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field.tsx";
import { Input } from "#components/ui/input.tsx";
import { Switch } from "#components/ui/switch.tsx";
import { useTRPC } from "#lib/trpc/trpc.utils.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FC, useCallback, useEffect, useState } from "react";

export const LotteryConfigTab: FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery(trpc.getLotteryConfig.queryOptions());
  const updateConfig = useMutation(trpc.updateLotteryConfig.mutationOptions());
  const startSession = useMutation(trpc.startLotterySession.mutationOptions());
  const finishSession = useMutation(trpc.finishLotterySession.mutationOptions());

  const [sessionTitle, setSessionTitle] = useState("");
  const [resetStockOnFinish, setResetStockOnFinish] = useState(true);
  const [resetProbabilitiesOnFinish, setResetProbabilitiesOnFinish] = useState(false);

  const [form, setForm] = useState({
    enabled: false,
    startTime: "16:00",
    endTime: "21:00",
    baseWinPressure: 0.15,
    maxBoost: 3,
    abuseWindowSeconds: 60,
    abuseMaxAttempts: 5,
    abuseMinIntervalSeconds: 10,
    abuseCooldownSeconds: 120,
  });

  useEffect(() => {
    if (config) {
      setForm({
        enabled: config.enabled,
        startTime: config.startTime,
        endTime: config.endTime,
        baseWinPressure: config.baseWinPressure,
        maxBoost: config.maxBoost,
        abuseWindowSeconds: config.abuseWindowSeconds,
        abuseMaxAttempts: config.abuseMaxAttempts,
        abuseMinIntervalSeconds: config.abuseMinIntervalSeconds,
        abuseCooldownSeconds: config.abuseCooldownSeconds,
      });
    }
  }, [config]);

  const handleSave = useCallback(async () => {
    await updateConfig.mutateAsync(form);
    await queryClient.invalidateQueries(trpc.getLotteryConfig.queryOptions());
    await queryClient.invalidateQueries(trpc.getLotterySessions.queryOptions());
  }, [form, updateConfig, queryClient, trpc]);

  const invalidateLotteryQueries = useCallback(async () => {
    await queryClient.invalidateQueries(trpc.getLotteryConfig.queryOptions());
    await queryClient.invalidateQueries(trpc.getLotterySessions.queryOptions());
    await queryClient.invalidateQueries(trpc.getLotteryAnalytics.queryFilter());
    await queryClient.invalidateQueries(trpc.getLotteryEvents.queryFilter());
    await queryClient.invalidateQueries(trpc.getLotteryLots.queryOptions());
  }, [queryClient, trpc]);

  const handleStartSession = useCallback(async () => {
    const title = sessionTitle.trim();
    await startSession.mutateAsync(
      title.length > 0 ? { title } : undefined,
    );
    await invalidateLotteryQueries();
  }, [invalidateLotteryQueries, sessionTitle, startSession]);

  const handleFinishSession = useCallback(async () => {
    await finishSession.mutateAsync({
      resetStock: resetStockOnFinish,
      resetProbabilities: resetProbabilitiesOnFinish,
    });
    await invalidateLotteryQueries();
  }, [
    finishSession,
    invalidateLotteryQueries,
    resetProbabilitiesOnFinish,
    resetStockOnFinish,
  ]);

  if (isLoading) {
    return <p className="p-4 text-xs text-muted-foreground">Loading…</p>;
  }

  const activeSession = config?.activeSession;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Session</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FieldDescription>
            The booth only prints the lottery ticket when a session is active{" "}
            <strong>and</strong> lottery is enabled. Starting a session here turns{" "}
            <strong>Lottery enabled</strong> on automatically so you don&apos;t need a separate
            save.
          </FieldDescription>
          <Field>
            <FieldLabel htmlFor="session-title">Title (optional)</FieldLabel>
            <Input
              id="session-title"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder="Launch night"
              disabled={config?.sessionActive === true}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleStartSession}
              disabled={
                startSession.isPending ||
                finishSession.isPending ||
                config?.sessionActive === true
              }
            >
              {startSession.isPending ? "…" : "Start session"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleFinishSession}
              disabled={
                startSession.isPending ||
                finishSession.isPending ||
                config?.sessionActive !== true
              }
            >
              {finishSession.isPending ? "…" : "End session"}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel>Refill stock on end</FieldLabel>
                <Switch
                  checked={resetStockOnFinish}
                  onCheckedChange={setResetStockOnFinish}
                />
              </div>
              <FieldDescription>
                When ending the session, set each lot&apos;s remaining stock back to its total.
              </FieldDescription>
            </Field>
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel>Reset win pressure &amp; boost</FieldLabel>
                <Switch
                  checked={resetProbabilitiesOnFinish}
                  onCheckedChange={setResetProbabilitiesOnFinish}
                />
              </div>
              <FieldDescription>
                After the session, restore base win pressure and max boost to their default values
                (0.15 and 3).
              </FieldDescription>
            </Field>
          </div>
          {config?.sessionActive === true && config.sessionStartedAt ? (
            <p className="text-xs text-muted-foreground">
              Session #
              <span className="font-mono text-foreground">
                {config.currentSessionId ?? activeSession?.id ?? "—"}
              </span>
              {activeSession?.title ? (
                <>
                  {" "}
                  — <span className="text-foreground">{activeSession.title}</span>
                </>
              ) : null}
              {" · "}
              started{" "}
              <span className="font-mono text-foreground">{config.sessionStartedAt}</span>
            </p>
          ) : null}
          {!config?.sessionActive && config?.lastSessionEndedAt ? (
            <p className="text-xs text-muted-foreground">
              Last ended:{" "}
              <span className="font-mono text-foreground">{config.lastSessionEndedAt}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">General</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <div className="flex items-center justify-between gap-4">
              <FieldLabel>Lottery enabled</FieldLabel>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="lottery-start">Start (HH:MM)</FieldLabel>
              <FieldDescription>
                Inclusive start of the daily window when draws are allowed.
              </FieldDescription>
              <Input
                id="lottery-start"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                placeholder="16:00"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="lottery-end">End (HH:MM)</FieldLabel>
              <FieldDescription>
                Exclusive end: the last allowed minute is one minute before this time.
              </FieldDescription>
              <Input
                id="lottery-end"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                placeholder="21:00"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Win probability</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="base-win-pressure">Base win pressure (0–1)</FieldLabel>
            <FieldDescription>
              Starting win probability before catch-up. The engine compares how much stock should
              have been given out by now vs. how much actually was, then scales this value up
              (when behind) or down (when ahead).
            </FieldDescription>
            <Input
              id="base-win-pressure"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.baseWinPressure}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  baseWinPressure: Number(e.target.value),
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="max-boost">Max boost (1–10)</FieldLabel>
            <FieldDescription>
              Maximum multiplier applied to base win pressure when prizes are behind schedule
              (stock not depleted fast enough for the elapsed time in the window).
            </FieldDescription>
            <Input
              id="max-boost"
              type="number"
              step="0.5"
              min="1"
              max="10"
              value={form.maxBoost}
              onChange={(e) => setForm((f) => ({ ...f, maxBoost: Number(e.target.value) }))}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Anti-abuse</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldDescription className="-mt-1">
            Recent draw attempts in the current session are checked. Too many attempts in a short
            window, or attempts closer than the minimum interval, yield a forced loss. After an
            abuse-related forced loss, further wins are blocked until the cooldown elapses.
          </FieldDescription>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="abuse-window">Rolling window (seconds)</FieldLabel>
              <FieldDescription>
                Only events in this sliding window count toward the attempt limit.
              </FieldDescription>
              <Input
                id="abuse-window"
                type="number"
                min="5"
                max="300"
                value={form.abuseWindowSeconds}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    abuseWindowSeconds: Number(e.target.value),
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="abuse-max">Max attempts in window</FieldLabel>
              <FieldDescription>
                If this many attempts occur within the rolling window, the next outcome is a forced
                loss.
              </FieldDescription>
              <Input
                id="abuse-max"
                type="number"
                min="2"
                max="50"
                value={form.abuseMaxAttempts}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    abuseMaxAttempts: Number(e.target.value),
                  }))
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="abuse-interval">Min interval (seconds)</FieldLabel>
              <FieldDescription>
                If any two attempts in the window are closer than this, abuse is triggered.
              </FieldDescription>
              <Input
                id="abuse-interval"
                type="number"
                min="1"
                max="60"
                value={form.abuseMinIntervalSeconds}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    abuseMinIntervalSeconds: Number(e.target.value),
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="abuse-cooldown">Cooldown (seconds)</FieldLabel>
              <FieldDescription>
                After a forced loss with abuse detected, wins stay blocked while any such event is
                newer than this duration.
              </FieldDescription>
              <Input
                id="abuse-cooldown"
                type="number"
                min="10"
                max="600"
                value={form.abuseCooldownSeconds}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    abuseCooldownSeconds: Number(e.target.value),
                  }))
                }
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={updateConfig.isPending} className="self-end">
        {updateConfig.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
};
