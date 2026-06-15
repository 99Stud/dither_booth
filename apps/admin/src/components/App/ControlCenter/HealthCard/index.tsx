import { Accordion } from "@dither-booth/ui/components/ui/accordion";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { sleep } from "@dither-booth/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type {
  Pm2RestartProgressEvent,
  Pm2RestartService,
} from "#lib/pm2/pm2-control.types";

import { CONTROL_CENTER_LOG_SOURCE } from "#app/ControlCenter/internal/ControlCenter.constants";
import { StatusDot } from "#components/Misc/StatusDot/index";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.utils";

import type { HealthzResponse } from "./internal/HealthCard.types";

import { HealthzAccordionItem } from "./internal/components/HealthzAccordionItem";
import { PrinterAccordionItem } from "./internal/components/PrinterAccordionItem";
import { PuppeteerAccordionItem } from "./internal/components/PuppeteerAccordionItem";
import {
  HEALTHZ_SERVICE_LABELS,
  RESTART_HEALTHZ_REFETCH_DELAY_MS,
} from "./internal/HealthCard.constants";
import { requestPm2ServiceRestart } from "./internal/HealthCard.utils";

const extractUnhealthyServicesCount = (healthz: HealthzResponse) => {
  let unhealthyServicesCount = 0;

  if (!healthz.web.healthz.ok) {
    unhealthyServicesCount++;
  }

  if (!healthz.api.healthz.ok) {
    unhealthyServicesCount++;
  }

  if (!healthz.puppeteer.healthz.ok) {
    unhealthyServicesCount++;
  }

  if (!healthz.printer.healthz.ok) {
    unhealthyServicesCount++;
  }

  return unhealthyServicesCount;
};

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
