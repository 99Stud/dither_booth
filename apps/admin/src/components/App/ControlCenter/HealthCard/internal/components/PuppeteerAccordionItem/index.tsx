import type { FC, ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@dither-booth/ui/components/ui/alert-dialog";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { format } from "date-fns";

import type { HealthzResponse } from "#components/App/ControlCenter/HealthCard/internal/HealthCard.types";

import { HealthAccordionShell } from "#components/App/ControlCenter/HealthCard/internal/components/HealthAccordionShell/index";
import { HealthCheckDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthCheckDetailRow/index";
import { HealthCollapsibleSection } from "#components/App/ControlCenter/HealthCard/internal/components/HealthCollapsibleSection/index";
import { HealthDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthDetailRow/index";
import {
  type HealthTooltipItem,
  HealthTooltipList,
} from "#components/App/ControlCenter/HealthCard/internal/components/HealthTooltipList/index";
import { getHealthStatusVariant } from "#components/App/ControlCenter/HealthCard/internal/HealthCard.utils";

interface PuppeteerAccordionItemProps {
  isHealthzSuccess: boolean;
  isHealthzPending: boolean;
  isHealthzError: boolean;
  healthz?: HealthzResponse;
  isRestarting: boolean;
  isRestartingPuppeteer: boolean;
  onRestart: () => void;
}

type PuppeteerHealthz = HealthzResponse["puppeteer"];

type PuppeteerCheck =
  | PuppeteerHealthz["healthz"]
  | PuppeteerHealthz["launch"]
  | PuppeteerHealthz["navigation"]
  | PuppeteerHealthz["page"]
  | PuppeteerHealthz["runtime"]
  | NonNullable<PuppeteerHealthz["runtime"]["details"]>["browser"]
  | NonNullable<PuppeteerHealthz["runtime"]["details"]>["clientRoute"]
  | NonNullable<PuppeteerHealthz["runtime"]["details"]>["document"]
  | NonNullable<PuppeteerHealthz["runtime"]["details"]>["page"]
  | NonNullable<PuppeteerHealthz["runtime"]["details"]>["url"];

interface HealthTooltipContent {
  items: HealthTooltipItem[];
  message?: ReactNode;
}

const renderTooltip = ({
  items,
  message,
}: HealthTooltipContent): ReactNode | undefined =>
  (message !== undefined && message !== null) || hasTooltipItems(items) ? (
    <HealthTooltipList message={message} items={items} />
  ) : undefined;

const hasTooltipItems = (items: HealthTooltipItem[]) =>
  items.some((item) => item.value !== undefined && item.value !== null);

const getErrorTooltipContent = (check: PuppeteerCheck): HealthTooltipContent =>
  check.ok
    ? { items: [] }
    : {
        message: check.error.message,
        items: [
          {
            label: "cause",
            value: check.error.cause,
          },
        ],
      };

const renderStartupTooltip = (check: PuppeteerHealthz["navigation"]) => {
  const errorTooltip = getErrorTooltipContent(check);

  return renderTooltip({
    message: errorTooltip.message,
    items: [
      {
        label: "path",
        value: check.details?.path,
      },
      {
        label: "url",
        value: check.details?.url,
      },
      ...errorTooltip.items,
    ],
  });
};

const renderRuntimeTooltip = (check: PuppeteerHealthz["runtime"]) => {
  const errorTooltip = getErrorTooltipContent(check);

  return renderTooltip({
    message: errorTooltip.message,
    items: [
      {
        label: "failed checks",
        value: check.details?.failedChecks?.join(", "),
      },
      ...errorTooltip.items,
    ],
  });
};

const renderDocumentTooltip = (
  check: NonNullable<PuppeteerHealthz["runtime"]["details"]>["document"],
) => {
  const errorTooltip = getErrorTooltipContent(check);

  return renderTooltip({
    message: errorTooltip.message,
    items: [
      {
        label: "readyState",
        value: check.details?.readyState,
      },
      {
        label: "expected readyState",
        value:
          check.details && "expectedReadyState" in check.details
            ? check.details.expectedReadyState
            : undefined,
      },
      ...errorTooltip.items,
    ],
  });
};

const renderUrlTooltip = (
  check: NonNullable<PuppeteerHealthz["runtime"]["details"]>["url"],
) => {
  const errorTooltip = getErrorTooltipContent(check);

  return renderTooltip({
    message: errorTooltip.message,
    items: [
      {
        label: "current URL",
        value: check.details?.currentUrl,
      },
      {
        label: "current path",
        value: check.details?.currentPath,
      },
      {
        label: "expected path",
        value: check.details?.expectedPath,
      },
      ...errorTooltip.items,
    ],
  });
};

const renderClientRouteTooltip = (
  check: NonNullable<PuppeteerHealthz["runtime"]["details"]>["clientRoute"],
) => {
  const errorTooltip = getErrorTooltipContent(check);

  return renderTooltip({
    message: errorTooltip.message,
    items: [
      {
        label: "status",
        value: check.details?.status,
      },
      {
        label: "statuses",
        value: check.details?.statuses.join(", "),
      },
      {
        label: "current URL",
        value: check.details?.currentUrl,
      },
      {
        label: "current path",
        value: check.details?.currentPath,
      },
      ...errorTooltip.items,
    ],
  });
};

export const PuppeteerAccordionItem: FC<PuppeteerAccordionItemProps> = ({
  isHealthzPending,
  isHealthzSuccess,
  isHealthzError,
  healthz,
  isRestarting,
  isRestartingPuppeteer,
  onRestart,
}) => {
  const puppeteer = healthz?.puppeteer;
  const runtimeDetails = puppeteer?.runtime.details;

  return (
    <HealthAccordionShell
      value="puppeteer"
      label="Puppeteer"
      statusDotSize="sm"
      statusVariant={getHealthStatusVariant({
        isHealthzError,
        isHealthzPending,
        isHealthzSuccess,
        isHealthy: healthz?.puppeteer.healthz.ok,
      })}
      footer={
        <div className={clsx("text-right")}>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button disabled={isRestarting} size="sm">
                  {isRestartingPuppeteer ? (
                    <>
                      Re-initializing Puppeteer&nbsp;
                      <Spinner className="size-4" />
                    </>
                  ) : (
                    <>Re-initialize Puppeteer&nbsp;</>
                  )}
                </Button>
              }
            />
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Do you really want to re-initialize Puppeteer?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Re-initializing Puppeteer will terminate the current browser
                  and launch a fresh receipt viewer. In-progress receipt
                  generation may fail.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onRestart()}>
                  Restart
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      }
    >
      {isHealthzSuccess && puppeteer && (
        <>
          <HealthCollapsibleSection title="Initialization sequence">
            <HealthCheckDetailRow
              as="li"
              check={puppeteer.launch}
              label="launch"
            />
            <HealthCheckDetailRow as="li" check={puppeteer.page} label="page" />
            <HealthCheckDetailRow
              as="li"
              check={puppeteer.navigation}
              label="navigation"
              tooltip={renderStartupTooltip(puppeteer.navigation)}
            />
            {!puppeteer.runtime.ok && (
              <HealthCheckDetailRow
                as="li"
                check={puppeteer.runtime}
                label="runtime"
                tooltip={renderRuntimeTooltip(puppeteer.runtime)}
              />
            )}
          </HealthCollapsibleSection>
          {runtimeDetails && (
            <HealthCollapsibleSection title="Runtime">
              <HealthCheckDetailRow
                as="li"
                check={runtimeDetails.browser}
                label="browser"
              />
              <HealthCheckDetailRow
                as="li"
                check={runtimeDetails.page}
                label="page"
              />
              <HealthCheckDetailRow
                as="li"
                check={runtimeDetails.document}
                label="document"
                tooltip={renderDocumentTooltip(runtimeDetails.document)}
              />
              <HealthCheckDetailRow
                as="li"
                check={runtimeDetails.url}
                label="url"
                tooltip={renderUrlTooltip(runtimeDetails.url)}
              />
              <HealthCheckDetailRow
                as="li"
                check={runtimeDetails.clientRoute}
                label="client route"
                tooltip={renderClientRouteTooltip(runtimeDetails.clientRoute)}
              />
            </HealthCollapsibleSection>
          )}
          <HealthDetailRow label="checked at">
            {format(
              new Date(puppeteer.healthz.timestamp),
              "MM/dd/yyyy hh:mm:ss a",
            )}
          </HealthDetailRow>
        </>
      )}
    </HealthAccordionShell>
  );
};
