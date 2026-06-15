import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@dither-booth/ui/components/ui/tooltip";
import clsx from "clsx";
import { Info } from "lucide-react";

import { HealthDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthDetailRow/index";
import { HealthTooltipList } from "#components/App/ControlCenter/HealthCard/internal/components/HealthTooltipList/index";

type HealthCheckLike =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: {
        cause?: string;
        message: string;
      };
      message: string;
    };

interface HealthCheckDetailRowProps<TCheck extends HealthCheckLike> {
  as?: "li" | "p";
  check: TCheck;
  className?: string;
  label: string;
  tooltip?: ReactNode;
}

export const HealthCheckDetailRow = <TCheck extends HealthCheckLike>({
  as,
  check,
  className,
  label,
  tooltip,
}: HealthCheckDetailRowProps<TCheck>) => {
  const tooltipContent =
    tooltip ??
    (!check.ok ? (
      <HealthTooltipList
        message={check.error.message}
        items={[
          {
            label: "cause",
            value: check.error.cause,
          },
        ]}
      />
    ) : null);

  return (
    <HealthDetailRow
      as={as}
      label={label}
      className={clsx("flex items-center", className)}
    >
      {check.ok ? (
        "ok"
      ) : (
        <span className={clsx("font-semibold text-red-500")}>failed</span>
      )}
      {tooltipContent && (
        <Tooltip>
          <TooltipTrigger
            render={<Info className={clsx("size-3", "ml-1")} />}
          />
          <TooltipContent className={clsx("max-w-sm")}>
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      )}
    </HealthDetailRow>
  );
};
