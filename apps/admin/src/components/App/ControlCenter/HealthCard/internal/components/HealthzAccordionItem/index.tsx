import type { ComponentProps, FC, MouseEventHandler } from "react";

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@dither-booth/ui/components/ui/tooltip";
import clsx from "clsx";
import { format } from "date-fns";

import type { HealthzResponse } from "#components/App/ControlCenter/HealthCard/internal/HealthCard.types";
import type {
  Pm2RestartProgressEvent,
  Pm2RestartService,
} from "#lib/pm2/pm2-control.types";

import { HealthAccordionShell } from "#components/App/ControlCenter/HealthCard/internal/components/HealthAccordionShell/index";
import { HealthCheckDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthCheckDetailRow/index";
import { HealthDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthDetailRow/index";
import {
  type HealthTooltipItem,
  HealthTooltipList,
} from "#components/App/ControlCenter/HealthCard/internal/components/HealthTooltipList/index";
import { HEALTHZ_SERVICE_LABELS } from "#components/App/ControlCenter/HealthCard/internal/HealthCard.constants";
import { getHealthStatusVariant } from "#components/App/ControlCenter/HealthCard/internal/HealthCard.utils";

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

type ServiceHealthz<TService extends "api" | "web"> =
  HealthzResponse[TService]["healthz"];

type RemoteServiceHealthz = ServiceHealthz<"api"> | ServiceHealthz<"web">;

const renderServiceTooltip = (check: RemoteServiceHealthz) => {
  if (check.ok) {
    return undefined;
  }

  const items: HealthTooltipItem[] = [
    {
      label: "cause",
      value: check.error.cause,
    },
    {
      label: "service",
      value: check.details?.service,
    },
    {
      label: "url",
      value: check.details?.url,
    },
    {
      label: "status",
      value:
        check.details && "status" in check.details
          ? String(check.details.status)
          : undefined,
    },
  ];

  return <HealthTooltipList message={check.error.message} items={items} />;
};

export const HealthzAccordionItem: FC<HealthzAccordionItemProps> = ({
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
          {serviceHealthz.ok ? (
            <>
              <HealthDetailRow label="mode">
                {serviceHealthz.mode}
              </HealthDetailRow>
              <HealthDetailRow label="checked at">
                {format(
                  new Date(serviceHealthz.timestamp),
                  "MM/dd/yyyy hh:mm:ss a",
                )}
              </HealthDetailRow>
            </>
          ) : (
            <>
              <HealthCheckDetailRow
                check={serviceHealthz}
                label="error"
                tooltip={renderServiceTooltip(serviceHealthz)}
              />
              <HealthDetailRow label="checked at">
                {format(
                  new Date(serviceHealthz.timestamp),
                  "MM/dd/yyyy hh:mm:ss a",
                )}
              </HealthDetailRow>
            </>
          )}
        </>
      )}
      {isHealthzError && <p>Failed to gather {service} health information.</p>}
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

const getRestartProgressLabel = (
  progressEvent: Pm2RestartProgressEvent | undefined,
  serviceLabel: string,
) => {
  switch (progressEvent?.type) {
    case "accepted":
      return `Starting ${serviceLabel} restart`;
    case "resolving-process":
      return "Resolving PM2 process";
    case "connecting":
      return "Connecting to PM2";
    case "restarting":
      return `Restarting ${serviceLabel}`;
    case "disconnecting":
      return "Disconnecting from PM2";
    case "completed":
      return `${serviceLabel} restarted`;
    case "failed":
      return `${serviceLabel} restart failed`;
    default:
      return `Restarting ${serviceLabel}`;
  }
};
