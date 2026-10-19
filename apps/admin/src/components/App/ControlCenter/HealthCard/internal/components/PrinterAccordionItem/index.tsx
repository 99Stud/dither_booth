import type { FC } from "react";

import clsx from "clsx";
import { format } from "date-fns";
import { Printer as PrinterIcon } from "lucide-react";

import type { HealthzResponse } from "#components/App/ControlCenter/HealthCard/internal/HealthCard.types";

import { HealthAccordionShell } from "#components/App/ControlCenter/HealthCard/internal/components/HealthAccordionShell/index";
import { HealthDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthDetailRow/index";
import { getHealthStatusVariant } from "#components/App/ControlCenter/HealthCard/internal/HealthCard.utils";
import { getPrinterHistoryLabel } from "#lib/printer/printer.copy";

interface PrinterAccordionItemProps {
  isHealthzSuccess: boolean;
  isHealthzPending: boolean;
  isHealthzError: boolean;
  healthz?: HealthzResponse;
}

/**
 * The printer as the engine's printer watch sees it. The Printer card has
 * the live view and what to do; this is the at-a-glance health row.
 */
export const PrinterAccordionItem: FC<PrinterAccordionItemProps> = ({
  isHealthzPending,
  isHealthzSuccess,
  isHealthzError,
  healthz,
}) => {
  const printer = healthz?.printer.healthz;
  const details = printer?.details;

  return (
    <HealthAccordionShell
      value="printer"
      label="Printer"
      icon={<PrinterIcon />}
      statusDotSize="sm"
      statusVariant={getHealthStatusVariant({
        hasWarning: Boolean(details?.warning),
        isHealthzError,
        isHealthzPending,
        isHealthzSuccess,
        isHealthy: printer?.ok,
      })}
    >
      {isHealthzSuccess && printer && details && (
        <>
          <HealthDetailRow label="status">
            <span className={clsx(!printer.ok && "font-semibold text-red-500")}>
              {printer.ok
                ? getPrinterHistoryLabel(details.conditions).toLowerCase()
                : printer.message}
            </span>
          </HealthDetailRow>
          <HealthDetailRow label="since">
            {format(new Date(details.changedAt), "HH:mm:ss")}
          </HealthDetailRow>
          <HealthDetailRow label="can print">
            {details.canPrint ? "yes" : "no"}
          </HealthDetailRow>
          {details.raw && (
            <HealthDetailRow label="last status">
              <span className={clsx("font-mono")}>
                {details.raw.match(/../g)?.join(" ")}
              </span>
            </HealthDetailRow>
          )}
          {details.lastError && (
            <HealthDetailRow label="last error">
              {details.lastError}
            </HealthDetailRow>
          )}
        </>
      )}
    </HealthAccordionShell>
  );
};
