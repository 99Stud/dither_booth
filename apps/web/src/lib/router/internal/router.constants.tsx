import { PrintConfiguration } from "#app/PrintConfiguration/index.tsx";
import { ReceiptViewer } from "#app/ReceiptViewer/index.tsx";
import { Root } from "#app/Root/index.tsx";
import { Sandbox } from "#app/Sandbox/index.tsx";

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
