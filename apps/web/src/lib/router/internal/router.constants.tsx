import { AdminPrint } from "#app/AdminPrint/index.tsx";
import { Booth } from "#app/Booth/index.tsx";
import { Names } from "#app/Names/index.tsx";
import { PrintConfiguration } from "#app/PrintConfiguration/index.tsx";
import { ReceiptViewer } from "#app/ReceiptViewer/index.tsx";
import { Root } from "#app/Root/index.tsx";
import { Sandbox } from "#app/Sandbox/index.tsx";
import { Splash } from "#app/Splash/index.tsx";

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
    path: "/receipt-viewer",
    component: ReceiptViewer,
  },
  {
    path: "/admin/print",
    component: AdminPrint,
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
