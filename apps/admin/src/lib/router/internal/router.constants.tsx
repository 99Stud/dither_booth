import { PrintConfiguration } from "#app/PrintConfiguration/index";
import { Root } from "#app/Root/index";

export const ROUTES_CONFIG = [
  {
    path: "/",
    component: Root,
  },
  {
    path: "/print-configuration",
    component: PrintConfiguration,
  },
] as const;
