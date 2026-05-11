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
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { format } from "date-fns";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { extractUnhealthyServices } from "./internal/HealthCard.utils";

const HEALTHZ_SERVICE_LABELS = {
  web: "Web",
  api: "API",
} as const;

export const HealthCard = () => {
  const trpc = useTRPC();

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
          <p
            className={clsx(
              "transition-opacity duration-500",
              isHealthzPending ? "opacity-0" : "opacity-100",
            )}
          >
            {isHealthzError
              ? "Failed to gather health information."
              : areAllChecksHealthy
                ? "All services are healthy."
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
            service="web"
          />
          <HealthzAccordionItem
            healthz={healthz}
            isHealthzSuccess={isHealthzSuccess}
            service="api"
          />
        </Accordion>
      </CardContent>
    </Card>
  );
};

interface HealthzAccordionItemProps {
  service: "web" | "api";
  isHealthzSuccess: boolean;
  healthz?: inferOutput<ReturnType<typeof useTRPC>["getHealthz"]>;
}

const HealthzAccordionItem: FC<HealthzAccordionItemProps> = ({
  service,
  isHealthzSuccess,
  healthz,
}) => {
  const serviceHealthz = healthz?.[service].healthz;

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
          </div>
        </AccordionContent>
      )}
    </AccordionItem>
  );
};
