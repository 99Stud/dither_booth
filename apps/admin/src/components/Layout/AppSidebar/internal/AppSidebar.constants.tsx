import type { ReactNode } from "react";

import { FolderCog, Printer, Ticket } from "lucide-react";

import { ROUTES_CONFIG } from "#lib/router/internal/router.constants";

export const APP_SIDEBAR_MENU_LINKS: Array<{
  label: string;
  path: string;
  icon: ReactNode;
}> = [
  {
    label: "Control center",
    path: ROUTES_CONFIG.get("control-center")!.path,
    icon: <FolderCog />,
  },
  {
    label: "Event",
    path: ROUTES_CONFIG.get("event")!.path,
    icon: <Ticket />,
  },
  {
    label: "Print configuration",
    path: ROUTES_CONFIG.get("print-configuration")!.path,
    icon: <Printer />,
  },
];
