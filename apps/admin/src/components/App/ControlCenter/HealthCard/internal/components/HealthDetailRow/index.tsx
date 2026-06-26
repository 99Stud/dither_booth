import type { FC, PropsWithChildren } from "react";

import { cn } from "@dither-booth/shared/styles";
import clsx from "clsx";

interface HealthDetailRowProps extends PropsWithChildren {
  className?: string;
  as?: "li" | "p";
  label: string;
}

export const HealthDetailRow: FC<HealthDetailRowProps> = ({
  className,
  as: DetailElement = "p",
  children,
  label,
}) => {
  return (
    <DetailElement className={cn(className)}>
      <span className={clsx("font-medium")}>{label}:</span>
      &nbsp;
      {children}
    </DetailElement>
  );
};
