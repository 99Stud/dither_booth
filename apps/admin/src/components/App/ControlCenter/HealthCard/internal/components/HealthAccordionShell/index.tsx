import type { ComponentProps, FC, PropsWithChildren, ReactNode } from "react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@dither-booth/ui/components/ui/accordion";
import clsx from "clsx";

import type { StatusDotVariant } from "#components/Misc/StatusDot/internal/StatusDot.types";

import { StatusDot } from "#components/Misc/StatusDot/index";

interface HealthAccordionShellProps extends PropsWithChildren {
  footer?: ReactNode;
  label: string;
  statusDotSize?: ComponentProps<typeof StatusDot>["size"];
  statusVariant: StatusDotVariant;
  value: string;
}

export const HealthAccordionShell: FC<HealthAccordionShellProps> = ({
  children,
  footer,
  label,
  statusDotSize,
  statusVariant,
  value,
}) => {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className={clsx("items-center gap-2")}>
        <StatusDot size={statusDotSize} variant={statusVariant} />
        {label}
      </AccordionTrigger>
      <AccordionContent>
        <div className={clsx("mb-2", "flex flex-col gap-1.5", "space-y-0!")}>
          {children}
        </div>
        {footer}
      </AccordionContent>
    </AccordionItem>
  );
};
