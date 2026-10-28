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
import { Cpu } from "lucide-react";

import { SYSTEM_PAGE_PATH } from "#lib/system/system.constants";

/**
 * The way to the System page on a phone, where the sidebar's link isn't
 * shown and the tab bar has no room for it.
 */
export const SystemCard = () => (
  <Card>
    <CardHeader>
      <CardTitle className={clsx("flex items-center gap-2.5")}>
        <IconBubble tone="rose">
          <Cpu />
        </IconBubble>
        <h2>System</h2>
      </CardTitle>
      <CardDescription>
        The Pi's temperature, throttling, memory, CPU and storage, live with the
        last hour. For tech staff, when the booth runs hot or slow.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Link
        className={clsx(buttonVariants({ variant: "outline" }), "w-full")}
        to={SYSTEM_PAGE_PATH}
      >
        Open System
      </Link>
    </CardContent>
  </Card>
);
