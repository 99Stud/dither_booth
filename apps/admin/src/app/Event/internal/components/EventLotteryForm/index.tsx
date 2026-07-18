import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { NumberField } from "@dither-booth/ui/fields/NumberField";
import { SwitchField } from "@dither-booth/ui/fields/SwitchField";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import { useEffect } from "react";

import type {
  CurrentEvent,
  LotterySettingsFormValues,
} from "../../Event.types";

import {
  LOTTERY_SETTINGS_FORM_SCHEMA,
  getLotterySettingsFormValues,
} from "../../Event.constants";

interface EventLotteryFormProps {
  event: CurrentEvent;
  isSaving: boolean;
  onSave: (values: LotterySettingsFormValues) => Promise<void>;
}

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

  useEffect(() => {
    form.reset(getLotterySettingsFormValues(event));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- sync on server lottery fields only
  }, [
    event.lottery.enabled,
    event.lottery.noWinWeight,
    event.lottery.winCooldownMinutes,
    event.lottery.id,
  ]);

  return (
    <Card className={clsx("max-w-xl")}>
      <CardHeader>
        <CardTitle>Lottery settings</CardTitle>
        <CardDescription>
          Only one lottery runs on the booth. Enabling this lottery disables any
          other enabled lottery rows.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className={clsx("flex flex-col gap-3")}
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            submitEvent.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <SwitchField form={form} name="enabled" label="Lottery enabled" />
          <NumberField form={form} name="noWinWeight" label="No-win weight" />
          <NumberField
            form={form}
            name="winCooldownMinutes"
            label="Win cooldown (minutes)"
          />
          <Button type="submit" disabled={isSaving} className={clsx("w-fit")}>
            Save lottery settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
