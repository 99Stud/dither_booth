import type { ComponentProps, FC, PropsWithChildren, ReactNode } from "react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@dither-booth/ui/components/ui/accordion";
import { buttonVariants } from "@dither-booth/ui/components/ui/button";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { ScrollText } from "lucide-react";

import type { StatusDotVariant } from "#components/Misc/StatusDot/internal/StatusDot.types";
import type { LogsSearch } from "#lib/logs/logs.search";

import { StatusDot } from "#components/Misc/StatusDot/index";
import { LOGS_PAGE_PATH } from "#lib/logs/logs.search";

interface HealthAccordionShellProps extends PropsWithChildren {
  footer?: ReactNode;
  /** The Logs page filter of this item's "View logs" link. */
  logsSearch?: LogsSearch;
  label: string;
  /** A lucide icon naming the service. */
  icon?: ReactNode;
  statusDotSize?: ComponentProps<typeof StatusDot>["size"];
  statusVariant: StatusDotVariant;
  value: string;
}

export const HealthAccordionShell: FC<HealthAccordionShellProps> = ({
  children,
  footer,
  logsSearch,
  label,
  icon,
  statusDotSize,
  statusVariant,
  value,
}) => {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className={clsx("items-center gap-2")}>
        <StatusDot size={statusDotSize} variant={statusVariant} />
        {icon && (
          <span className={clsx("text-muted-foreground [&_svg]:size-4")}>
            {icon}
          </span>
        )}
        {label}
      </AccordionTrigger>
      <AccordionContent>
        <div className={clsx("mb-2", "flex flex-col gap-1.5", "space-y-0!")}>
          {children}
        </div>
        {logsSearch && (
          <Link
            to={LOGS_PAGE_PATH}
            search={logsSearch}
            className={clsx(
              buttonVariants({ variant: "link", size: "sm" }),
              "mb-2 h-auto px-0 text-muted-foreground hover:text-foreground",
            )}
          >
            <ScrollText />
            View logs
          </Link>
        )}
        {footer}
      </AccordionContent>
    </AccordionItem>
  );
};
