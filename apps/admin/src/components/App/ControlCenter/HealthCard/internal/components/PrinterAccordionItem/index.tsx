import type { FC } from "react";

import { format } from "date-fns";

import type { HealthzResponse } from "#components/App/ControlCenter/HealthCard/internal/HealthCard.types";

import { HealthAccordionShell } from "#components/App/ControlCenter/HealthCard/internal/components/HealthAccordionShell/index";
import { HealthCheckDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthCheckDetailRow/index";
import { HealthDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthDetailRow/index";
import {
  type HealthTooltipItem,
  HealthTooltipList,
} from "#components/App/ControlCenter/HealthCard/internal/components/HealthTooltipList/index";
import { getHealthStatusVariant } from "#components/App/ControlCenter/HealthCard/internal/HealthCard.utils";

interface PrinterAccordionItemProps {
  isHealthzSuccess: boolean;
  isHealthzPending: boolean;
  isHealthzError: boolean;
  healthz?: HealthzResponse;
}

type PrinterHealthz = HealthzResponse["printer"]["healthz"];

const getPrinterDetailValue = <TKey extends string>(
  details: object | undefined,
  key: TKey,
) => {
  if (!details || !(key in details)) {
    return undefined;
  }

  return (details as Record<TKey, unknown>)[key];
};

const formatBooleanPrinterDetail = (
  details: object | undefined,
  key: string,
) => {
  const value = getPrinterDetailValue(details, key);

  return typeof value === "boolean" ? formatBoolean(value) : undefined;
};

const formatNumberPrinterDetail = (
  details: object | undefined,
  key: string,
) => {
  const value = getPrinterDetailValue(details, key);

  return typeof value === "number" ? value : undefined;
};

const renderPrinterTooltip = (printer: PrinterHealthz) => {
  if (printer.ok) {
    return undefined;
  }

  const details = printer.details;
  const items: HealthTooltipItem[] = [
    {
      label: "cause",
      value: printer.error.cause,
    },
    {
      label: "detected printers",
      value: formatNumberPrinterDetail(details, "detectedPrinterCount"),
    },
    {
      label: "current device present",
      value: formatBooleanPrinterDetail(details, "currentDevicePresent"),
    },
    {
      label: "adapter device attached",
      value: formatBooleanPrinterDetail(details, "adapterDeviceAttached"),
    },
  ];

  return <HealthTooltipList message={printer.error.message} items={items} />;
};

export const PrinterAccordionItem: FC<PrinterAccordionItemProps> = ({
  isHealthzPending,
  isHealthzSuccess,
  isHealthzError,
  healthz,
}) => {
  const printer = healthz?.printer.healthz;

  return (
    <HealthAccordionShell
      value="printer"
      label="Printer"
      statusDotSize="sm"
      statusVariant={getHealthStatusVariant({
        isHealthzError,
        isHealthzPending,
        isHealthzSuccess,
        isHealthy: healthz?.printer.healthz.ok,
      })}
    >
      {isHealthzSuccess && printer && (
        <>
          <HealthCheckDetailRow
            check={printer}
            label="status"
            tooltip={renderPrinterTooltip(printer)}
          />
          <HealthDetailRow label="checked at">
            {format(new Date(printer.timestamp), "MM/dd/yyyy hh:mm:ss a")}
          </HealthDetailRow>
        </>
      )}
    </HealthAccordionShell>
  );
};

const formatBoolean = (value: boolean) => (value ? "yes" : "no");
