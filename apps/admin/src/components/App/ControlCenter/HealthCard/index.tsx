import type {
  Pm2RestartProgressEvent,
  Pm2RestartService,
} from "#lib/pm2/pm2-control.types";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { FC } from "react";

import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@dither-booth/ui/components/ui/accordion";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { cn, sleep } from "@dither-booth/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { format } from "date-fns";
import { RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  HEALTHZ_SERVICE_LABELS,
  RESTART_HEALTHZ_REFETCH_DELAY_MS,
} from "./internal/HealthCard.constants";
import {
  extractUnhealthyServices,
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

  const areAllChecksHealthy =
    isHealthzSuccess && healthz.web.healthz.ok && healthz.api.healthz.ok;

  const unhealthyServices = isHealthzSuccess
    ? extractUnhealthyServices(healthz)
    : undefined;

  const refetchHealthzAndNotify = async () => {
    const healthzResult = await refetchHealthz({
      throwOnError: true,
    }).catch((e) => {
      reportKioskError(e, {
        event: "control-center-healthz-refetch-failed",
        source: "control-center",
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
        source: "control-center",
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
        source: "control-center",
        userMessage: "Failed to refresh health checks after restart.",
      });
    });

    setRestartProgress(undefined);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("relative", "flex items-center gap-2")}>
          <h2>Health checks</h2>
          <div
            className={clsx(
              "size-2",
              "rounded-full transition-colors duration-500",
              isHealthzPending
                ? "animate-pulse bg-gray-500"
                : areAllChecksHealthy
                  ? "bg-green-500"
                  : isHealthzError
                    ? "bg-red-500"
                    : unhealthyServices && unhealthyServices.length > 0
                      ? "bg-yellow-500"
                      : "bg-gray-500",
            )}
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
                  : unhealthyServices && unhealthyServices.length > 0
                    ? `Some services are not healthy: ${unhealthyServices.join(", ")}`
                    : "Unknown health status."}
          </p>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion disabled={isHealthzPending}>
          <HealthzAccordionItem
            healthz={healthz}
            isHealthzSuccess={isHealthzSuccess}
            isHealthzError={isHealthzError}
            service="web"
            isRestarting={restartProgress !== undefined}
            restartProgress={restartProgress?.event}
            restartingService={restartProgress?.service}
            onRestart={restartService}
          />
          <HealthzAccordionItem
            healthz={healthz}
            isHealthzSuccess={isHealthzSuccess}
            isHealthzError={isHealthzError}
            service="api"
            isRestarting={restartProgress !== undefined}
            restartProgress={restartProgress?.event}
            restartingService={restartProgress?.service}
            onRestart={restartService}
          />
        </Accordion>
      </CardContent>
    </Card>
  );
};

interface HealthzAccordionItemProps {
  service: Pm2RestartService;
  isHealthzSuccess: boolean;
  isHealthzError: boolean;
  healthz?: inferOutput<ReturnType<typeof useTRPC>["getHealthz"]>;
  isRestarting: boolean;
  restartProgress?: Pm2RestartProgressEvent;
  restartingService?: Pm2RestartService;
  onRestart: (service: Pm2RestartService) => void;
}

const HealthzAccordionItem: FC<HealthzAccordionItemProps> = ({
  service,
  isHealthzSuccess,
  isHealthzError,
  healthz,
  isRestarting,
  restartProgress,
  restartingService,
  onRestart,
}) => {
  const serviceHealthz = healthz?.[service].healthz;
  const isRestartingThisService = isRestarting && restartingService === service;
  const shouldShowRestartButton =
    (isHealthzSuccess && serviceHealthz && !serviceHealthz.ok) ||
    (isHealthzError && service === "api");

  return (
    <AccordionItem value={service}>
      <AccordionTrigger>
        {HEALTHZ_SERVICE_LABELS[service]}&nbsp;
        {isHealthzSuccess && serviceHealthz && !serviceHealthz.ok && (
          <div className={clsx("size-1", "rounded-full bg-red-500")} />
        )}
      </AccordionTrigger>
      {isHealthzSuccess && serviceHealthz && (
        <AccordionContent>
          <div className={clsx("flex flex-col gap-1.5", "space-y-0!")}>
            <p>Mode: {serviceHealthz.mode}</p>
            <p>
              Checked at:&nbsp;
              {format(
                new Date(serviceHealthz.timestamp),
                "MM/dd/yyyy hh:mm:ss a",
              )}
            </p>
            {shouldShowRestartButton && (
              <RestartServiceButton
                className={clsx("self-end")}
                disabled={isRestarting}
                isRestarting={isRestartingThisService}
                onRestart={() => onRestart(service)}
                restartProgress={restartProgress}
                service={service}
              />
            )}
          </div>
        </AccordionContent>
      )}
      {isHealthzError && (
        <AccordionContent>
          <div className={clsx("flex flex-col gap-2", "space-y-0!")}>
            <p>Failed to gather {service} health information.</p>
            {shouldShowRestartButton && (
              <RestartServiceButton
                className={clsx("self-end")}
                disabled={isRestarting}
                isRestarting={isRestartingThisService}
                onRestart={() => onRestart(service)}
                restartProgress={restartProgress}
                service={service}
              />
            )}
          </div>
        </AccordionContent>
      )}
    </AccordionItem>
  );
};

interface RestartServiceButtonProps {
  className?: string;
  disabled: boolean;
  isRestarting: boolean;
  onRestart: () => void;
  restartProgress?: Pm2RestartProgressEvent;
  service: Pm2RestartService;
}

const RestartServiceButton: FC<RestartServiceButtonProps> = ({
  className,
  disabled,
  isRestarting,
  onRestart,
  restartProgress,
  service,
}) => {
  const serviceLabel = HEALTHZ_SERVICE_LABELS[service];

  return (
    <Button
      className={cn(className)}
      disabled={disabled}
      onClick={onRestart}
      size="sm"
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
