import type { FC, ReactNode } from "react";

import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dither-booth/ui/components/ui/collapsible";
import { Slider } from "@dither-booth/ui/components/ui/slider";
import { Switch } from "@dither-booth/ui/components/ui/switch";
import { NumberField } from "@dither-booth/ui/fields/NumberField";
import { useForm, useStore } from "@tanstack/react-form";
import clsx from "clsx";
import { ChevronDown, Dices, Save } from "lucide-react";
import { useEffect } from "react";

import type {
  CurrentEvent,
  LotterySettingsFormValues,
} from "../../Event.types";

import {
  LOTTERY_SETTINGS_FORM_SCHEMA,
  getLotterySettingsFormValues,
} from "../../Event.constants";
import {
  computeOdds,
  formatOneIn,
  getDrawablePrizes,
  noWinWeightForChance,
} from "../../lottery-odds.utils";
import { LotteryForecastCard } from "../LotteryForecastCard/index";
import { LotteryOddsCard } from "../LotteryOddsCard/index";

/** The slider stops at 60 min; longer pauses are typed under Advanced. */
const COOLDOWN_SLIDER_MAX_MINUTES = 60;

const firstValue = (value: number | readonly number[]) =>
  Array.isArray(value) ? (value[0] ?? 0) : (value as number);

/** One setting: a plain-language label and hint, the control on the right. */
const SettingRow: FC<{
  label: string;
  hint: ReactNode;
  htmlFor?: string;
  control?: ReactNode;
  children?: ReactNode;
}> = ({ label, hint, htmlFor, control, children }) => (
  <div className={clsx("flex flex-col gap-3")}>
    <div className={clsx("flex items-start justify-between gap-4")}>
      <div className={clsx("min-w-0")}>
        <label className={clsx("text-sm font-medium")} htmlFor={htmlFor}>
          {label}
        </label>
        <p className={clsx("text-sm text-muted-foreground")}>{hint}</p>
      </div>
      {control}
    </div>
    {children}
  </div>
);

const ValuePill: FC<{ children: ReactNode }> = ({ children }) => (
  <span
    className={clsx(
      "shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm font-semibold tabular-nums",
    )}
  >
    {children}
  </span>
);

interface EventLotteryFormProps {
  event: CurrentEvent;
  isSaving: boolean;
  onSave: (values: LotterySettingsFormValues) => Promise<void>;
}

/**
 * The Lottery tab: settings in plain words (a win chance instead of a raw
 * no-win weight, a pause instead of a cooldown), and next to them what they
 * mean for guests and for the stock, updated live before saving.
 */
export const EventLotteryForm: FC<EventLotteryFormProps> = (props) => {
  const { event, isSaving, onSave } = props;

  const form = useForm({
    defaultValues: getLotterySettingsFormValues(event),
    validators: {
      onChange: LOTTERY_SETTINGS_FORM_SCHEMA,
      onSubmit: LOTTERY_SETTINGS_FORM_SCHEMA,
    },
    onSubmit: async ({ value }) => {
      await onSave(value);
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const isDirty = useStore(form.store, (state) => state.isDirty);

  useEffect(() => {
    form.reset(getLotterySettingsFormValues(event));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- sync on server lottery fields only
  }, [
    event.lottery.enabled,
    event.lottery.noWinWeight,
    event.lottery.winCooldownMinutes,
    event.lottery.printLoserTicket,
    event.lottery.id,
  ]);

  const drawableWeight = getDrawablePrizes(event.prizes).reduce(
    (sum, prize) => sum + prize.weight,
    0,
  );
  const { winChance } = computeOdds({
    noWinWeight: values.noWinWeight,
    prizes: event.prizes,
  });
  const winPercent = Math.round(winChance * 100);

  return (
    <div
      className={clsx(
        "grid items-start gap-4 md:gap-6",
        "lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]",
      )}
    >
      <Card>
        <CardHeader>
          <CardTitle className={clsx("flex items-center gap-2.5")}>
            <IconBubble tone="violet">
              <Dices />
            </IconBubble>
            Lottery settings
          </CardTitle>
        </CardHeader>
        <form
          className={clsx("contents")}
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            submitEvent.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <CardContent className={clsx("flex flex-col gap-6")}>
            <form.Field name="enabled">
              {(field) => (
                <SettingRow
                  htmlFor="lottery-enabled"
                  label={
                    field.state.value ? "Lottery is live" : "Lottery is off"
                  }
                  hint={
                    field.state.value
                      ? "Each photo is a chance to win."
                      : "Guests only get their photo."
                  }
                  control={
                    <Switch
                      id="lottery-enabled"
                      checked={field.state.value}
                      onCheckedChange={(checked) => field.handleChange(checked)}
                    />
                  }
                />
              )}
            </form.Field>

            <SettingRow
              htmlFor="win-chance"
              label="Chance to win"
              hint={
                drawableWeight > 0
                  ? `About ${formatOneIn(winChance)} guests win something.`
                  : "Add prizes with stock to set the odds."
              }
              control={<ValuePill>{winPercent}%</ValuePill>}
            >
              <Slider
                id="win-chance"
                disabled={drawableWeight === 0}
                min={1}
                max={100}
                step={1}
                value={[Math.max(winPercent, 1)]}
                onValueChange={(value) =>
                  form.setFieldValue(
                    "noWinWeight",
                    noWinWeightForChance(
                      firstValue(value) / 100,
                      drawableWeight,
                    ),
                  )
                }
              />
            </SettingRow>

            <form.Field name="winCooldownMinutes">
              {(field) => (
                <SettingRow
                  htmlFor="win-cooldown"
                  label="Pause after a win"
                  hint={
                    field.state.value === 0
                      ? "Guests can win back to back."
                      : `After a win, nobody can win for ${field.state.value} min.`
                  }
                  control={<ValuePill>{field.state.value} min</ValuePill>}
                >
                  <Slider
                    id="win-cooldown"
                    min={0}
                    max={Math.max(
                      COOLDOWN_SLIDER_MAX_MINUTES,
                      field.state.value,
                    )}
                    step={1}
                    value={[field.state.value]}
                    onValueChange={(value) =>
                      field.handleChange(Math.round(firstValue(value)))
                    }
                  />
                </SettingRow>
              )}
            </form.Field>

            <form.Field name="printLoserTicket">
              {(field) => (
                <SettingRow
                  htmlFor="print-loser-ticket"
                  label="Print a ticket when they don't win"
                  hint="A friendly “better luck next time” ticket."
                  control={
                    <Switch
                      id="print-loser-ticket"
                      checked={field.state.value}
                      onCheckedChange={(checked) => field.handleChange(checked)}
                    />
                  }
                />
              )}
            </form.Field>

            <Collapsible>
              <CollapsibleTrigger
                render={
                  <button
                    type="button"
                    className={clsx(
                      "group flex items-center gap-1 text-sm text-muted-foreground",
                      "hover:text-foreground",
                    )}
                  />
                }
              >
                <ChevronDown
                  className={clsx(
                    "size-4 transition-transform group-data-[panel-open]:rotate-180",
                  )}
                />
                Advanced
              </CollapsibleTrigger>
              <CollapsibleContent className={clsx("pt-3")}>
                <NumberField
                  form={form}
                  name="noWinWeight"
                  label="No-win weight"
                />
                <p className={clsx("mt-1.5 text-xs text-muted-foreground")}>
                  The weight of “no prize” next to the prize weights. The slider
                  above sets it for you.
                </p>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
          <CardFooter className={clsx("justify-end gap-2 border-t")}>
            {isDirty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => form.reset(getLotterySettingsFormValues(event))}
              >
                Discard
              </Button>
            )}
            <Button type="submit" disabled={isSaving || !isDirty}>
              <Save data-icon="inline-start" />
              Save
            </Button>
          </CardFooter>
        </form>
      </Card>

      <div className={clsx("flex flex-col gap-4 md:gap-6")}>
        <LotteryOddsCard
          enabled={values.enabled}
          noWinWeight={values.noWinWeight}
          prizes={event.prizes}
        />
        <LotteryForecastCard
          noWinWeight={values.noWinWeight}
          winCooldownMinutes={values.winCooldownMinutes}
          prizes={event.prizes}
        />
      </div>
    </div>
  );
};
