import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { buttonVariants } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { ScrollText } from "lucide-react";

import { LOGS_PAGE_PATH } from "#lib/logs/logs.search";

/**
 * The way to the Logs page on a phone, where the sidebar's link isn't shown
 * and the tab bar has no room for it.
 */
export const LogsCard = () => (
  <Card>
    <CardHeader>
      <CardTitle className={clsx("flex items-center gap-2.5")}>
        <IconBubble tone="sky">
          <ScrollText />
        </IconBubble>
        <h2>Logs</h2>
      </CardTitle>
      <CardDescription>
        Live logs from the Engine, the Shutter, the admin, the system and the
        browsers. For tech staff, when something goes wrong.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Link
        className={clsx(buttonVariants({ variant: "outline" }), "w-full")}
        to={LOGS_PAGE_PATH}
      >
        Open Logs
      </Link>
    </CardContent>
  </Card>
);
