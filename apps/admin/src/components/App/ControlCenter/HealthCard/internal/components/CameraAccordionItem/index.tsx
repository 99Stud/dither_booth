import type { FC } from "react";

import { format } from "date-fns";
import { Camera } from "lucide-react";

import type { HealthzResponse } from "#components/App/ControlCenter/HealthCard/internal/HealthCard.types";

import { HealthAccordionShell } from "#components/App/ControlCenter/HealthCard/internal/components/HealthAccordionShell/index";
import { HealthDetailRow } from "#components/App/ControlCenter/HealthCard/internal/components/HealthDetailRow/index";
import {
  getHealthStatusVariant,
  getKioskCameraHealth,
} from "#components/App/ControlCenter/HealthCard/internal/HealthCard.utils";

interface CameraAccordionItemProps {
  isHealthzSuccess: boolean;
  isHealthzPending: boolean;
  isHealthzError: boolean;
  healthz?: HealthzResponse;
}

type KioskPage = HealthzResponse["shutter"]["kiosk"]["pages"][number];

const SCREEN_LABELS: Record<KioskPage["screen"], string> = {
  shutter: "Shutter",
  darkroom: "Darkroom",
};

const describeCamera = (page: KioskPage) => {
  if (!page.camera) {
    return page.screen === "darkroom"
      ? "not running (Darkroom locked)"
      : "not reported yet";
  }

  const { status, error } = page.camera;
  return error ? `${status}, ${error}` : status;
};

/**
 * The booth camera, as each booth screen page last reported it. Only a page
 * connected to the engine can report: a closed or frozen tab shows as no
 * kiosk connected, never as a stale "ready".
 */
export const CameraAccordionItem: FC<CameraAccordionItemProps> = ({
  isHealthzPending,
  isHealthzSuccess,
  isHealthzError,
  healthz,
}) => {
  const pages = healthz?.shutter.kiosk.pages ?? [];

  return (
    <HealthAccordionShell
      value="camera"
      label="Camera"
      icon={<Camera />}
      statusDotSize="sm"
      statusVariant={getHealthStatusVariant({
        isHealthzError,
        isHealthzPending,
        isHealthzSuccess,
        isHealthy: getKioskCameraHealth(pages),
      })}
    >
      {isHealthzSuccess &&
        (pages.length === 0 ? (
          <HealthDetailRow label="status">no kiosk connected</HealthDetailRow>
        ) : (
          pages.map((page) => (
            <HealthDetailRow
              key={page.pageId}
              label={
                pages.length > 1
                  ? `${SCREEN_LABELS[page.screen]} page`
                  : "status"
              }
            >
              {describeCamera(page)}
              {page.reportedAt &&
                ` (at ${format(new Date(page.reportedAt), "HH:mm:ss")})`}
            </HealthDetailRow>
          ))
        ))}
    </HealthAccordionShell>
  );
};
