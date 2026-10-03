import type { TextFieldName } from "@dither-booth/ui/fields/TextField";
import type { FC } from "react";

import { formatPrice } from "@dither-booth/shared/formatting";
import {
  PHOTO_TICKET_TOTAL_CENTS,
  TICKET_ITEM_NAME_MAX_LENGTH,
  TICKET_ITEM_NAMES_MAX_COUNT,
} from "@dither-booth/shared/routes";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { TextField } from "@dither-booth/ui/fields/TextField";
import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import { useEffect } from "react";

import type { CurrentEvent, TicketItemsFormValues } from "../../Event.types";

import {
  TICKET_ITEMS_FORM_SCHEMA,
  getTicketItemsFormValues,
} from "../../Event.constants";

const ticketItemFieldName = (
  index: number,
): TextFieldName<TicketItemsFormValues> =>
  `names[${index}]` as TextFieldName<TicketItemsFormValues>;

export const EventTicketItemsCard: FC<{
  event: CurrentEvent;
  isSaving: boolean;
  onSave: (names: string[]) => Promise<void>;
}> = (props) => {
  const { event, isSaving, onSave } = props;
  const namesKey = event.campaign.ticketItemNames.join("\u0000");

  const form = useForm({
    defaultValues: getTicketItemsFormValues(event),
    validators: {
      onChange: TICKET_ITEMS_FORM_SCHEMA,
      onSubmit: TICKET_ITEMS_FORM_SCHEMA,
    },
    onSubmit: async ({ value }) => {
      await onSave(value.names);
    },
  });

  useEffect(() => {
    form.reset(getTicketItemsFormValues(event));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- sync when saved names change
  }, [event.campaign.id, namesKey]);

  return (
    <Card className={clsx("md:col-span-2")}>
      <CardHeader>
        <CardTitle>Ticket items</CardTitle>
        <CardDescription>
          Each line prints as 1x. Prices are a random split of{" "}
          {formatPrice(PHOTO_TICKET_TOTAL_CENTS)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className={clsx("flex flex-col gap-4")}
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            submitEvent.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="names" mode="array">
            {(field) => (
              <div className={clsx("flex flex-col gap-3")}>
                {field.state.value.map((_, index) => (
                  <div
                    key={ticketItemFieldName(index)}
                    className={clsx("flex items-end gap-2")}
                  >
                    <TextField
                      className={clsx("min-w-0 flex-1")}
                      form={form}
                      name={ticketItemFieldName(index)}
                      label={`Item ${index + 1}`}
                      maxLength={TICKET_ITEM_NAME_MAX_LENGTH}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={field.state.value.length <= 1}
                      onClick={() => field.removeValue(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <div className={clsx("flex gap-2")}>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      field.state.value.length >= TICKET_ITEM_NAMES_MAX_COUNT
                    }
                    onClick={() => field.pushValue("")}
                  >
                    Add item
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    Save items
                  </Button>
                </div>
              </div>
            )}
          </form.Field>
        </form>
      </CardContent>
    </Card>
  );
};
