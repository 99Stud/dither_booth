import { HeirveyReceiptViewer } from "#app/HeirveyReceiptViewer/index";
import { Root } from "#app/Root/index";
import { Sandbox } from "#app/Sandbox/index";
import { TartinesReceiptViewer } from "#app/TartinesReceiptViewer/index";

import type { RouteConfig } from "./router.types";

export const ROUTE_KEYS = [
  "root",
  "tartines-receipt-viewer",
  "heirvey-receipt-viewer",
  "sandbox",
] as const;

export const ROUTES_CONFIG: RouteConfig = new Map([
  [
    "root",
    {
      path: "/",
      component: Root,
    },
  ],
  [
    "tartines-receipt-viewer",
    {
      path: "/tartines-receipt-viewer",
      component: TartinesReceiptViewer,
    },
  ],
  [
    "heirvey-receipt-viewer",
    {
      path: "/heirvey-receipt-viewer",
      component: HeirveyReceiptViewer,
    },
  ],
  [
    "sandbox",
    {
      path: "/sandbox",
      component: Sandbox,
    },
  ],
]);
