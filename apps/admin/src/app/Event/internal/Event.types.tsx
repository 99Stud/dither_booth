import type { EngineRouter } from "@dither-booth/engine/router.types";
import type { TRPCOptionsProxy, inferOutput } from "@trpc/tanstack-react-query";
import type z from "zod";

import type {
  CREATE_EVENT_FORM_SCHEMA,
  LOTTERY_SETTINGS_FORM_SCHEMA,
  PRIZE_FORM_SCHEMA,
  createRestockPrizeFormSchema,
  TICKET_ITEMS_FORM_SCHEMA,
  UPDATE_EVENT_FORM_SCHEMA,
} from "./Event.constants";

type ConfigProcedures = TRPCOptionsProxy<EngineRouter>["config"];

export type CurrentEvent = NonNullable<
  inferOutput<ConfigProcedures["getCurrentEvent"]>
>;
export type EventPrize = CurrentEvent["prizes"][number];

export type EventTab = "overview" | "lottery" | "prizes" | "draws";

export type CreateEventFormValues = z.infer<typeof CREATE_EVENT_FORM_SCHEMA>;
export type UpdateEventFormValues = z.infer<typeof UPDATE_EVENT_FORM_SCHEMA>;
export type TicketItemsFormValues = z.infer<typeof TICKET_ITEMS_FORM_SCHEMA>;
export type LotterySettingsFormValues = z.infer<
  typeof LOTTERY_SETTINGS_FORM_SCHEMA
>;
export type PrizeFormValues = z.infer<typeof PRIZE_FORM_SCHEMA>;
export type RestockPrizeFormValues = z.infer<
  ReturnType<typeof createRestockPrizeFormSchema>
>;
