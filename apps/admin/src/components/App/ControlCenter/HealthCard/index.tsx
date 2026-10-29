import type { KioskReloadMode } from "@dither-booth/shared/kiosk";

import { sleep } from "@dither-booth/shared/async";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Accordion } from "@dither-booth/ui/components/ui/accordion";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Activity, RefreshCcw } from "lucide-react";
import { useState } from "react";

import type { HealthzResponse } from "#lib/healthz/healthz.types";
import type {
  Pm2RestartProgressEvent,
  Pm2RestartService,
} from "#lib/pm2/pm2-control.types";

import { CONTROL_CENTER_LOG_SOURCE } from "#app/ControlCenter/internal/ControlCenter.constants";
import { StatusDot } from "#components/Misc/StatusDot/index";
import { notify } from "#lib/feedback/notify";
import { getKioskCameraHealth } from "#lib/healthz/healthz.utils";
import { reportKioskError } from "#lib/logging/logging.utils";
import { getOverallSystemStatus } from "#lib/system/system.utils";
import { useSystemMetrics } from "#lib/system/useSystemMetrics";
import { useTRPC } from "#lib/trpc/trpc.client";

import { CameraAccordionItem } from "./internal/components/CameraAccordionItem";
import { HealthzAccordionItem } from "./internal/components/HealthzAccordionItem";
import { KioskReloadSection } from "./internal/components/KioskReloadSection";
import { PrinterAccordionItem } from "./internal/components/PrinterAccordionItem";
import { PuppeteerAccordionItem } from "./internal/components/PuppeteerAccordionItem";
import { SoftwareAccordionItem } from "./internal/components/SoftwareAccordionItem";
import { SystemAccordionItem } from "./internal/components/SystemAccordionItem";
import {
  HEALTHZ_SERVICE_LABELS,
  KIOSK_RELOAD_HEALTHZ_REFETCH_DELAY_MS,
  RESTART_HEALTHZ_REFETCH_DELAY_MS,
} from "./internal/HealthCard.constants";
import { requestPm2ServiceRestart } from "./internal/HealthCard.utils";

const extractUnhealthyServicesCount = (healthz: HealthzResponse) => {
  let unhealthyServicesCount = 0;

  if (!healthz.shutter.healthz.ok) {
    unhealthyServicesCount++;
  }

  if (!healthz.engine.healthz.ok) {
    unhealthyServicesCount++;
  }

  if (!healthz.puppeteer.healthz.ok) {
    unhealthyServicesCount++;
  }

  if (!healthz.printer.healthz.ok) {
    unhealthyServicesCount++;
  }

  // Only a failed camera counts: none running (no kiosk) isn't a failure.
  if (getKioskCameraHealth(healthz.shutter.kiosk.pages) === false) {
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
    trpc.ops.getHealthz.queryOptions(undefined, {
      refetchInterval: (query) => {
        return query.state.status === "error" ? 5000 : 30000;
      },
      refetchIntervalInBackground: true,
      refetchOnReconnect: true,
      // Alone: it waits on the Shutter, which may be the thing that's down.
      trpc: { context: { skipBatch: true } },
    }),
  );
  const {
    mutateAsync: restartPuppeteerReceiptViewer,
    isPending: isRestartPuppeteerPending,
  } = useMutation(trpc.ops.restartPuppeteerReceiptViewer.mutationOptions());
  const { mutateAsync: reloadKiosk, isPending: isReloadKioskPending } =
    useMutation(trpc.ops.reloadKiosk.mutationOptions());
  // The Pi itself, from the admin server: it answers while the engine is down.
  const {
    data: system,
    isPending: isSystemPending,
    isError: isSystemError,
  } = useSystemMetrics();
  // Only a critical Pi counts: warm or low is worth a look, not a failure.
  const isSystemCritical =
    system !== undefined && getOverallSystemStatus(system) === "critical";

  const areAllChecksHealthy =
    isHealthzSuccess &&
    healthz.shutter.healthz.ok &&
    healthz.engine.healthz.ok &&
    healthz.puppeteer.healthz.ok &&
    healthz.printer.healthz.ok &&
    getKioskCameraHealth(healthz.shutter.kiosk.pages) !== false &&
    !isSystemCritical;

  const unhealthyServices = isHealthzSuccess
    ? extractUnhealthyServicesCount(healthz) + (isSystemCritical ? 1 : 0)
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

    notify.success("Health checks refreshed.");
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

    notify.success(`${serviceLabel} restart completed.`);
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

  const requestKioskReload = async (mode: KioskReloadMode) => {
    const reloadResult = await reloadKiosk({ mode }).catch((e) => {
      reportKioskError(e, {
        event: "control-center-kiosk-reload-failed",
        source: CONTROL_CENTER_LOG_SOURCE,
        userMessage: "Failed to send the reload to the kiosk.",
      });
    });

    if (!reloadResult) {
      return;
    }

    if (reloadResult.delivered === 0) {
      notify.warning("The booth screen is offline.");
      return;
    }

    notify.success(
      `Reload sent to ${reloadResult.delivered} kiosk page${reloadResult.delivered > 1 ? "s" : ""}${mode === "when-idle" ? ", once the current visit ends" : ""}.`,
    );

    await sleep(KIOSK_RELOAD_HEALTHZ_REFETCH_DELAY_MS);

    await refetchHealthz({
      throwOnError: true,
    }).catch((e) => {
      reportKioskError(e, {
        event: "control-center-healthz-refetch-after-kiosk-reload-failed",
        source: CONTROL_CENTER_LOG_SOURCE,
        userMessage: "Failed to refresh health checks after the kiosk reload.",
      });
    });
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
      notify.success("Puppeteer re-initialized.");
    } else {
      notify.error("Puppeteer re-initialized but is unhealthy.");
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
          <IconBubble tone="emerald">
            <Activity />
          </IconBubble>
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
            variant="ghost"
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
            service="shutter"
            isRestarting={isRestarting}
            restartProgress={restartProgress?.event}
            restartingService={restartProgress?.service}
            onRestart={restartService}
          >
            {isHealthzSuccess && (
              <KioskReloadSection
                pages={healthz.shutter.kiosk.pages}
                isReloading={isReloadKioskPending}
                onReload={(mode) => void requestKioskReload(mode)}
              />
            )}
          </HealthzAccordionItem>
          <HealthzAccordionItem
            isHealthzPending={isHealthzPending}
            healthz={healthz}
            isHealthzSuccess={isHealthzSuccess}
            isHealthzError={isHealthzError}
            service="engine"
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
          <CameraAccordionItem
            isHealthzPending={isHealthzPending}
            isHealthzSuccess={isHealthzSuccess}
            isHealthzError={isHealthzError}
            healthz={healthz}
          />
          <PrinterAccordionItem
            isHealthzPending={isHealthzPending}
            isHealthzSuccess={isHealthzSuccess}
            isHealthzError={isHealthzError}
            healthz={healthz}
          />
          <SystemAccordionItem
            snapshot={system}
            isPending={isSystemPending}
            isError={isSystemError}
          />
          <SoftwareAccordionItem />
        </Accordion>
      </CardContent>
    </Card>
  );
};
