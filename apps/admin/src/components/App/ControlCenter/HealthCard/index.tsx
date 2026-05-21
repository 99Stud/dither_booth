import type {
  ComponentProps,
  FC,
  MouseEventHandler,
  PropsWithChildren,
  ReactNode,
} from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@dither-booth/ui/components/ui/accordion";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dither-booth/ui/components/ui/collapsible";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@dither-booth/ui/components/ui/tooltip";
import { sleep } from "@dither-booth/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { format } from "date-fns";
import { ChevronsUpDown, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { StatusDotVariant } from "#components/Misc/StatusDot/internal/StatusDot.types";
import type {
  Pm2RestartProgressEvent,
  Pm2RestartService,
} from "#lib/pm2/pm2-control.types";

import { CONTROL_CENTER_LOG_SOURCE } from "#app/ControlCenter/internal/ControlCenter.constants";
import { StatusDot } from "#components/Misc/StatusDot/index";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.utils";

import type { HealthzResponse } from "./internal/HealthCard.types";

import {
  HEALTHZ_SERVICE_LABELS,
  RESTART_HEALTHZ_REFETCH_DELAY_MS,
} from "./internal/HealthCard.constants";
import {
  extractUnhealthyServicesCount,
  getHealthStatusVariant,
  getRestartProgressLabel,
  requestPm2ServiceRestart,
} from "./internal/HealthCard.utils";

export const HealthCard = () => {
  const trpc = useTRPC();
  const [restartProgress, setRestartProgress] = useState<{
    event?: Pm2RestartProgressEvent;
    service: Pm2RestartService;
  }>();

  const {
    data: healthz,
    isPending: isHealthzPending,
    isFetching: isHealthzFetching,
    refetch: refetchHealthz,
    isSuccess: isHealthzSuccess,
    isError: isHealthzError,
  } = useQuery(
    trpc.getHealthz.queryOptions(undefined, {
      refetchInterval: (query) => {
        return query.state.status === "error" ? 5000 : 30000;
      },
      refetchIntervalInBackground: true,
      refetchOnReconnect: true,
    }),
  );
  const {
    mutateAsync: restartPuppeteerReceiptViewer,
    isPending: isRestartPuppeteerPending,
  } = useMutation(trpc.restartPuppeteerReceiptViewer.mutationOptions());

  const areAllChecksHealthy =
    isHealthzSuccess &&
    healthz.web.healthz.ok &&
    healthz.api.healthz.ok &&
    healthz.puppeteer.healthz.ok &&
    healthz.printer.healthz.ok;

  const unhealthyServices = isHealthzSuccess
    ? extractUnhealthyServicesCount(healthz)
    : undefined;
  const isRestarting =
    restartProgress !== undefined || isRestartPuppeteerPending;

  const refetchHealthzAndNotify = async () => {
    const healthzResult = await refetchHealthz({
      throwOnError: true,
    }).catch((e) => {
      reportKioskError(e, {
        event: "control-center-healthz-refetch-failed",
        source: CONTROL_CENTER_LOG_SOURCE,
        userMessage: "Failed to refresh health checks.",
      });
    });

    if (!healthzResult) {
      return;
    }

    toast.success("Health checks refreshed.");
  };

  const restartService = async (service: Pm2RestartService) => {
    const serviceLabel = HEALTHZ_SERVICE_LABELS[service];

    setRestartProgress({ service });

    const restartResult = await requestPm2ServiceRestart({
      onProgress: (event) => {
        setRestartProgress({
          event,
          service,
        });
      },
      service,
    }).catch((e) => {
      const userMessage =
        e instanceof Error ? e.message : `Failed to restart ${serviceLabel}.`;

      reportKioskError(e, {
        event: "control-center-pm2-restart-failed",
        source: CONTROL_CENTER_LOG_SOURCE,
        userMessage,
      });
    });

    if (!restartResult) {
      setRestartProgress(undefined);
      return;
    }

    toast.success(`${serviceLabel} restart completed.`);
    await sleep(RESTART_HEALTHZ_REFETCH_DELAY_MS);

    await refetchHealthz({
      throwOnError: true,
    }).catch((e) => {
      reportKioskError(e, {
        event: "control-center-healthz-refetch-after-restart-failed",
        source: CONTROL_CENTER_LOG_SOURCE,
        userMessage: "Failed to refresh health checks after restart.",
      });
    });

    setRestartProgress(undefined);
  };

  const reinitializePuppeteer = async () => {
    const restartResult = await restartPuppeteerReceiptViewer().catch((e) => {
      reportKioskError(e, {
        event: "control-center-puppeteer-restart-failed",
        source: CONTROL_CENTER_LOG_SOURCE,
        userMessage: "Failed to re-initialize Puppeteer.",
      });
    });

    if (!restartResult) {
      return;
    }

    if (restartResult.ok) {
      toast.success("Puppeteer re-initialized.");
    } else {
      toast.error("Puppeteer re-initialized but is unhealthy.");
    }

    await sleep(RESTART_HEALTHZ_REFETCH_DELAY_MS);

    await refetchHealthz({
      throwOnError: true,
    }).catch((e) => {
      reportKioskError(e, {
        event: "control-center-healthz-refetch-after-puppeteer-restart-failed",
        source: CONTROL_CENTER_LOG_SOURCE,
        userMessage:
          "Failed to refresh health checks after Puppeteer re-initialization.",
      });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("relative", "flex items-center gap-2")}>
          <h2>Health checks</h2>
          <StatusDot
            size="md"
            variant={
              isHealthzPending
                ? "pending"
                : areAllChecksHealthy
                  ? "success"
                  : isHealthzError
                    ? "error"
                    : unhealthyServices && unhealthyServices > 0
                      ? "warning"
                      : "neutral"
            }
          />

          <Button
            aria-label="Refresh health checks"
            className={clsx("absolute top-0 right-0")}
            size="icon-sm"
            onClick={refetchHealthzAndNotify}
            disabled={isHealthzFetching}
          >
            <RefreshCcw className={clsx(isHealthzFetching && "animate-spin")} />
          </Button>
        </CardTitle>
        <CardDescription>
          <p className={clsx("transition-opacity duration-500")}>
            {isHealthzFetching
              ? "Checking health..."
              : areAllChecksHealthy
                ? "All services are healthy."
                : isHealthzError
                  ? "Failed to gather health information."
                  : unhealthyServices && unhealthyServices > 0
                    ? `${unhealthyServices} service${unhealthyServices > 1 ? "s are" : " is"} not healthy`
                    : "Unknown health status."}
          </p>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion disabled={isHealthzPending}>
          <HealthzAccordionItem
            isHealthzPending={isHealthzPending}
            healthz={healthz}
            isHealthzSuccess={isHealthzSuccess}
            isHealthzError={isHealthzError}
            service="web"
            isRestarting={isRestarting}
            restartProgress={restartProgress?.event}
            restartingService={restartProgress?.service}
            onRestart={restartService}
          />
          <HealthzAccordionItem
            isHealthzPending={isHealthzPending}
            healthz={healthz}
            isHealthzSuccess={isHealthzSuccess}
            isHealthzError={isHealthzError}
            service="api"
            isRestarting={isRestarting}
            restartProgress={restartProgress?.event}
            restartingService={restartProgress?.service}
            onRestart={restartService}
          />
          <PuppeteerAccordionItem
            isHealthzPending={isHealthzPending}
            isHealthzSuccess={isHealthzSuccess}
            isHealthzError={isHealthzError}
            healthz={healthz}
            isRestarting={isRestarting}
            isRestartingPuppeteer={isRestartPuppeteerPending}
            onRestart={reinitializePuppeteer}
          />
          <PrinterAccordionItem
            isHealthzPending={isHealthzPending}
            isHealthzSuccess={isHealthzSuccess}
            isHealthzError={isHealthzError}
            healthz={healthz}
          />
        </Accordion>
        <p className={clsx("mt-3 text-right")}>
          <span className="font-medium">Process manager:</span>&nbsp;
          {isHealthzPending
            ? "checking..."
            : isHealthzSuccess
              ? healthz.runtime.processManager
              : "undefined"}
        </p>
      </CardContent>
    </Card>
  );
};

interface HealthzAccordionItemProps {
  service: Pm2RestartService;
  isHealthzSuccess: boolean;
  isHealthzPending: boolean;
  isHealthzError: boolean;
  healthz?: HealthzResponse;
  isRestarting: boolean;
  restartProgress?: Pm2RestartProgressEvent;
  restartingService?: Pm2RestartService;
  onRestart: (service: Pm2RestartService) => void;
}

const HealthzAccordionItem: FC<HealthzAccordionItemProps> = ({
  service,
  isHealthzSuccess,
  isHealthzPending,
  isHealthzError,
  healthz,
  isRestarting,
  restartProgress,
  restartingService,
  onRestart,
}) => {
  const serviceHealthz = healthz?.[service].healthz;
  const isRestartingThisService = isRestarting && restartingService === service;
  const processManager = healthz?.runtime.processManager;

  return (
    <HealthAccordionShell
      value={service}
      label={HEALTHZ_SERVICE_LABELS[service]}
      statusVariant={getHealthStatusVariant({
        isHealthzError,
        isHealthzPending,
        isHealthzSuccess,
        isHealthy: serviceHealthz?.ok,
      })}
      footer={
        <div className={clsx("text-right")}>
          {processManager !== "pm2" ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className={clsx("inline-block", "w-fit")}>
                    <RestartServiceButton
                      disabled
                      isRestarting={false}
                      service={service}
                    />
                  </span>
                }
              />
              <TooltipContent className={clsx("max-w-3xs")}>
                <p>Only services running with PM2 can be restarted.</p>
              </TooltipContent>
            </Tooltip>
          ) : isHealthzSuccess && serviceHealthz && serviceHealthz.ok ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <RestartServiceButton
                    disabled={isRestarting}
                    isRestarting={isRestartingThisService}
                    restartProgress={restartProgress}
                    service={service}
                  />
                }
              />
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Do you really want to restart a running service?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Restarting a running service will cause the service to stop
                    and start again, affecting the experience.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onRestart(service)}>
                    Restart
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <RestartServiceButton
              disabled={isRestarting}
              isRestarting={isRestartingThisService}
              onRestartClick={() => onRestart(service)}
              restartProgress={restartProgress}
              service={service}
            />
          )}
        </div>
      }
    >
      {isHealthzSuccess && serviceHealthz && (
        <>
          <HealthDetailRow label="mode">{serviceHealthz.mode}</HealthDetailRow>
          <HealthDetailRow label="checked at">
            {format(
              new Date(serviceHealthz.timestamp),
              "MM/dd/yyyy hh:mm:ss a",
            )}
          </HealthDetailRow>
        </>
      )}
      {isHealthzError && <p>Failed to gather {service} health information.</p>}
    </HealthAccordionShell>
  );
};

interface HealthAccordionShellProps extends PropsWithChildren {
  footer?: ReactNode;
  label: string;
  statusDotSize?: ComponentProps<typeof StatusDot>["size"];
  statusVariant: StatusDotVariant;
  value: string;
}

const HealthAccordionShell: FC<HealthAccordionShellProps> = ({
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

interface HealthDetailRowProps extends PropsWithChildren {
  as?: "li" | "p";
  label: string;
}

const HealthDetailRow: FC<HealthDetailRowProps> = ({
  as: DetailElement = "p",
  children,
  label,
}) => {
  return (
    <DetailElement>
      <span className={clsx("font-medium")}>{label}:</span>
      &nbsp;
      {children}
    </DetailElement>
  );
};

interface HealthCollapsibleSectionProps extends PropsWithChildren {
  title: string;
}

const HealthCollapsibleSection: FC<HealthCollapsibleSectionProps> = ({
  children,
  title,
}) => {
  return (
    <Collapsible>
      <CollapsibleTrigger
        className={clsx(
          "mb-1",
          "flex items-center gap-1",
          "cursor-pointer",
          "font-medium",
        )}
      >
        {title}
        <ChevronsUpDown className="size-3" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className={clsx("mt-1.5 mb-1.5 ml-1")}>{children}</ul>
      </CollapsibleContent>
    </Collapsible>
  );
};

interface PuppeteerAccordionItemProps {
  isHealthzSuccess: boolean;
  isHealthzPending: boolean;
  isHealthzError: boolean;
  healthz?: HealthzResponse;
  isRestarting: boolean;
  isRestartingPuppeteer: boolean;
  onRestart: () => void;
}

const PuppeteerAccordionItem: FC<PuppeteerAccordionItemProps> = ({
  isHealthzPending,
  isHealthzSuccess,
  isHealthzError,
  healthz,
  isRestarting,
  isRestartingPuppeteer,
  onRestart,
}) => {
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
      {isHealthzSuccess && healthz && (
        <>
          <HealthCollapsibleSection title="Initialization sequence">
            <HealthDetailRow as="li" label="launch">
              {healthz.puppeteer.launch.ok ? "ok" : "failed"}
            </HealthDetailRow>
            <HealthDetailRow as="li" label="page">
              {healthz.puppeteer.page.ok ? "ok" : "failed"}
            </HealthDetailRow>
            <HealthDetailRow as="li" label="navigation">
              {healthz.puppeteer.navigation.ok ? "ok" : "failed"}
            </HealthDetailRow>
            {!healthz.puppeteer.runtime.ok && (
              <HealthDetailRow as="li" label="runtime">
                failed
              </HealthDetailRow>
            )}
          </HealthCollapsibleSection>
          <HealthCollapsibleSection title="Runtime">
            <HealthDetailRow as="li" label="browser">
              {healthz.puppeteer.runtime.details.browser.ok ? "ok" : "failed"}
            </HealthDetailRow>
            <HealthDetailRow as="li" label="page">
              {healthz.puppeteer.runtime.details.page.ok ? "ok" : "failed"}
            </HealthDetailRow>
            <HealthDetailRow as="li" label="document">
              {healthz.puppeteer.runtime.details.document.ok ? "ok" : "failed"}
            </HealthDetailRow>
            <HealthDetailRow as="li" label="url">
              {healthz.puppeteer.runtime.details.url.ok ? "ok" : "failed"}
            </HealthDetailRow>
          </HealthCollapsibleSection>
          <HealthDetailRow label="checked at">
            {format(
              new Date(healthz.puppeteer.healthz.timestamp),
              "MM/dd/yyyy hh:mm:ss a",
            )}
          </HealthDetailRow>
        </>
      )}
    </HealthAccordionShell>
  );
};

interface PrinterAccordionItemProps {
  isHealthzSuccess: boolean;
  isHealthzPending: boolean;
  isHealthzError: boolean;
  healthz?: HealthzResponse;
}

const PrinterAccordionItem: FC<PrinterAccordionItemProps> = ({
  isHealthzPending,
  isHealthzSuccess,
  isHealthzError,
  healthz,
}) => {
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
      {isHealthzSuccess && healthz && (
        <>
          {healthz.printer.healthz.details &&
            !("error" in healthz.printer.healthz.details) && (
              <HealthCollapsibleSection title="Debug">
                <HealthDetailRow as="li" label="detected printers">
                  {healthz.printer.healthz.details.detectedPrinterCount}
                </HealthDetailRow>
                <HealthDetailRow as="li" label="current device present">
                  {healthz.printer.healthz.details.currentDevicePresent
                    ? "yes"
                    : "no"}
                </HealthDetailRow>
                <HealthDetailRow as="li" label="adapter device attached">
                  {healthz.printer.healthz.details.adapterDeviceAttached
                    ? "yes"
                    : "no"}
                </HealthDetailRow>
              </HealthCollapsibleSection>
            )}
          {!healthz.printer.healthz.ok && (
            <HealthDetailRow label="error">
              {healthz.printer.healthz.message}
            </HealthDetailRow>
          )}
          {"error" in healthz.printer.healthz.details && (
            <HealthDetailRow label="error">
              {healthz.printer.healthz.details.error}
            </HealthDetailRow>
          )}
          <HealthDetailRow label="checked at">
            {format(
              new Date(healthz.printer.healthz.timestamp),
              "MM/dd/yyyy hh:mm:ss a",
            )}
          </HealthDetailRow>
        </>
      )}
    </HealthAccordionShell>
  );
};

interface RestartServiceButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "children"
> {
  isRestarting: boolean;
  onRestartClick?: MouseEventHandler<HTMLButtonElement>;
  restartProgress?: Pm2RestartProgressEvent;
  service: Pm2RestartService;
}

const RestartServiceButton: FC<RestartServiceButtonProps> = ({
  ref,
  isRestarting,
  onRestartClick,
  restartProgress,
  service,
  ...buttonProps
}) => {
  const serviceLabel = HEALTHZ_SERVICE_LABELS[service];

  return (
    <Button
      ref={ref}
      {...buttonProps}
      size="sm"
      onClick={(e) => {
        onRestartClick?.(e);
        buttonProps.onClick?.(e);
      }}
    >
      {isRestarting ? (
        <>
          {getRestartProgressLabel(restartProgress, serviceLabel)}&nbsp;
          <Spinner className="size-4" />
        </>
      ) : (
        <>Restart {serviceLabel}&nbsp;</>
      )}
    </Button>
  );
};
