import { AdminHeirveyReceipt } from "#app/AdminHeirveyReceipt/index.tsx";
import { AdminLottery } from "#app/AdminLottery/index.tsx";
import { AdminPrint } from "#app/AdminPrint/index.tsx";
import { Booth } from "#app/Booth/index.tsx";
import { LotteryTicketViewer } from "#app/LotteryTicketViewer/index.tsx";
import { Names } from "#app/Names/index.tsx";
import { PrintConfiguration } from "#app/PrintConfiguration/index.tsx";
import { Root } from "#app/Root/index.tsx";
import { Sandbox } from "#app/Sandbox/index.tsx";
import { Splash } from "#app/Splash/index.tsx";
import z from "zod";

/** Default receipt layout when `template` is missing or invalid. */
export const RECEIPT_TEMPLATE = "nexus" as const;
export const HEIRVEY_RECEIPT_TEMPLATE = "heirvey" as const;
export const RECEIPT_TEMPLATE_VALUES = [
  RECEIPT_TEMPLATE,
  HEIRVEY_RECEIPT_TEMPLATE,
] as const;

export const RECEIPT_VIEWER_SEARCH_SCHEMA = z.object({
  template: z
    .enum(RECEIPT_TEMPLATE_VALUES)
    .optional()
    .catch(RECEIPT_TEMPLATE),
  ticket: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
      typeof v === "string" ? v.split("|").filter(Boolean) : (v ?? []),
    ),
  ticketRef: z
    .string()
    .regex(/^\d{6}$/)
    .optional()
    .catch(undefined),
});

export type ReceiptViewerSearch = z.infer<typeof RECEIPT_VIEWER_SEARCH_SCHEMA>;

export const ROUTES_CONFIG = [
  {
    path: "/",
    component: Splash,
  },
  {
    path: "/names",
    component: Names,
  },
  {
    path: "/booth",
    component: Booth,
  },
  {
    path: "/lottery-ticket-viewer",
    component: LotteryTicketViewer,
  },
  {
    path: "/admin/print",
    component: AdminPrint,
  },
  {
    path: "/admin/lottery",
    component: AdminLottery,
  },
  {
    path: "/admin/heirvey-receipt",
    component: AdminHeirveyReceipt,
  },
  {
    path: "/sandbox",
    component: Sandbox,
  },
  {
    path: "/print-configuration",
    component: PrintConfiguration,
  },
  {
    path: "/download-receipt",
    component: Root,
  },
] as const;
