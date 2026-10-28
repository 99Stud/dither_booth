import type { FC, PropsWithChildren, ReactNode } from "react";

import {
  IconBubble,
  type IconBubbleTone,
} from "@dither-booth/ui/components/misc/IconBubble";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import clsx from "clsx";

import type { SystemStatus } from "#lib/system/system.utils";

import { StatusDot } from "#components/Misc/StatusDot/index";
import { getStatusDotVariant } from "#lib/system/system.utils";

import { useStatusPulse } from "../../hooks/useStatusPulse";
import { SYSTEM_PANEL_ATTRIBUTE } from "../../System.motion";

interface SystemPanelProps extends PropsWithChildren {
  title: string;
  icon: ReactNode;
  tone: IconBubbleTone;
  status: SystemStatus | null;
  /** The status in a word staff can act on: "Warm", "Running low". */
  statusLabel: string;
  description?: string;
  className?: string;
  contentClassName?: string;
}

/**
 * One reading's card: a titled section with its status as a dot and a
 * word, so a glance at the page's headers says what needs a look.
 */
export const SystemPanel: FC<SystemPanelProps> = ({
  title,
  icon,
  tone,
  status,
  statusLabel,
  description,
  className,
  contentClassName,
  children,
}) => {
  const pulseRef = useStatusPulse<HTMLSpanElement>(status);

  return (
    <Card
      {...{ [SYSTEM_PANEL_ATTRIBUTE]: "" }}
      className={clsx("h-full", className)}
    >
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone={tone}>{icon}</IconBubble>
          <h2>{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <p
            role="status"
            className={clsx(
              "flex items-center gap-2 text-sm font-medium whitespace-nowrap",
            )}
          >
            <span ref={pulseRef} className={clsx("inline-flex")}>
              <StatusDot size="md" variant={getStatusDotVariant(status)} />
            </span>
            {statusLabel}
          </p>
        </CardAction>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
};
