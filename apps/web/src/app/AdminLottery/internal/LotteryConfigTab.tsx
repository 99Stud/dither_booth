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
  }, [form, updateConfig, queryClient, trpc]);

  if (isLoading) {
    return <p className="p-4 text-xs text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
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
            <FieldDescription>
              When on, draws happen only inside the daily time window below. Turn off to
              disable the lottery entirely.
            </FieldDescription>
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
            Recent draw attempts are checked. Too many attempts in a short window, or attempts
            closer than the minimum interval, yield a forced loss. After an abuse-related forced
            loss, further wins are blocked until the cooldown elapses.
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
