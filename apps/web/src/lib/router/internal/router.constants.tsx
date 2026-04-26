import { PrintConfiguration } from "#app/PrintConfiguration/index";
import { ReceiptViewer } from "#app/ReceiptViewer/index";
import { Root } from "#app/Root/index";
import { Sandbox } from "#app/Sandbox/index";

export const ROUTES_CONFIG = [
  {
    path: "/",
    component: Root,
  },
  {
    path: "/receipt-viewer",
    component: ReceiptViewer,
  },
  {
    path: "/sandbox",
    component: Sandbox,
  },
  {
    path: "/print-configuration",
    component: PrintConfiguration,
  },
] as const;
