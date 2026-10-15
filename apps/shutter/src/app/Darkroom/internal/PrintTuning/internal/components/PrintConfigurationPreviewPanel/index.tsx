import type {
  ComponentProps,
  CSSProperties,
  FC,
  PointerEvent,
  RefObject,
} from "react";

import {
  Webcam,
  type WebcamHandle,
} from "@dither-booth/ui/components/misc/Webcam";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { CameraIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

type WebcamProps = ComponentProps<typeof Webcam>;

const PREVIEW_MAGNIFIER_SIZE_PX = 160;
const PREVIEW_MAGNIFIER_ZOOM = 1.25;

interface PrintConfigurationPreviewPanelProps {
  hasTriggeredInitialPreview: boolean;
  isLoading: boolean;
  isRefreshDisabled: boolean;
  onCameraStateChange?: WebcamProps["onCameraStateChange"];
  onConstraintFallbackError?: WebcamProps["onConstraintFallbackError"];
  onRefreshPreview: () => Promise<void> | void;
  previewSrc?: string;
  webcamRef: RefObject<WebcamHandle | null>;
}

export const PrintConfigurationPreviewPanel: FC<
  PrintConfigurationPreviewPanelProps
> = ({
  hasTriggeredInitialPreview,
  isLoading,
  isRefreshDisabled,
  onCameraStateChange,
  onConstraintFallbackError,
  onRefreshPreview,
  previewSrc,
  webcamRef,
}) => {
  return (
    <div className={clsx("relative", "aspect-square h-full")}>
      <div className={clsx("relative", "h-full overflow-y-auto")}>
        {hasTriggeredInitialPreview && (
          <PreviewDisplay
            isLoading={isLoading}
            isMagnifierEnabled={true}
            previewSrc={previewSrc}
          />
        )}
        <Webcam
          ref={webcamRef}
          className={clsx("h-full", previewSrc && "hidden")}
          onCameraStateChange={onCameraStateChange}
          onConstraintFallbackError={onConstraintFallbackError}
        />
      </div>
      <Button
        disabled={isRefreshDisabled}
        onClick={() => {
          void onRefreshPreview();
        }}
        className={clsx("absolute z-20", "top-4", "left-4")}
      >
        {!previewSrc ? (
          <CameraIcon className="size-4" />
        ) : (
          <RefreshCwIcon className="size-4" />
        )}
      </Button>
    </div>
  );
};

interface PreviewDisplayProps {
  isLoading: boolean;
  isMagnifierEnabled: boolean;
  previewSrc?: string;
}

const PreviewDisplay: FC<PreviewDisplayProps> = ({
  isLoading,
  isMagnifierEnabled,
  previewSrc,
}) => {
  return previewSrc ? (
    <div className={clsx("relative w-full overflow-hidden")}>
      <div
        className={clsx(
          "absolute z-10",
          "h-full w-full",
          "pointer-events-none",
          "transition-all",
          isLoading && "bg-card/05 backdrop-blur-xs",
        )}
      />
      {isLoading && (
        <Spinner
          className={clsx(
            "absolute inset-0 z-10",
            "m-auto",
            "text-white",
            "size-6",
          )}
        />
      )}
      <PreviewImage
        isMagnifierEnabled={isMagnifierEnabled && !isLoading}
        previewSrc={previewSrc}
      />
    </div>
  ) : (
    <div
      className={clsx(
        "absolute z-10",
        "h-full w-full",
        "flex items-center justify-center",
        "bg-card/05 backdrop-blur-xs",
      )}
    >
      <Spinner className="text-white" />
    </div>
  );
};

interface PreviewImageProps {
  isMagnifierEnabled: boolean;
  previewSrc: string;
}

const PreviewImage: FC<PreviewImageProps> = ({
  isMagnifierEnabled,
  previewSrc,
}) => {
  const animationFrameRef = useRef<number | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const hideLens = useCallback(() => {
    pointerRef.current = null;

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (lensRef.current) {
      lensRef.current.style.opacity = "0";
    }
  }, []);

  const updateLens = useCallback(() => {
    animationFrameRef.current = null;

    const image = imageRef.current;
    const lens = lensRef.current;
    const pointer = pointerRef.current;

    if (!image || !lens || !pointer) {
      return;
    }

    const imageRect = image.getBoundingClientRect();
    const pointerX = pointer.clientX - imageRect.left;
    const pointerY = pointer.clientY - imageRect.top;

    if (
      pointerX < 0 ||
      pointerX > imageRect.width ||
      pointerY < 0 ||
      pointerY > imageRect.height
    ) {
      hideLens();
      return;
    }

    lens.style.opacity = "1";
    lens.style.left = `${pointerX}px`;
    lens.style.top = `${pointerY}px`;
    lens.style.backgroundSize = `${imageRect.width * PREVIEW_MAGNIFIER_ZOOM}px ${
      imageRect.height * PREVIEW_MAGNIFIER_ZOOM
    }px`;
    lens.style.backgroundPosition = `${
      PREVIEW_MAGNIFIER_SIZE_PX / 2 - pointerX * PREVIEW_MAGNIFIER_ZOOM
    }px ${PREVIEW_MAGNIFIER_SIZE_PX / 2 - pointerY * PREVIEW_MAGNIFIER_ZOOM}px`;
  }, [hideLens]);

  const scheduleLensUpdate = useCallback(() => {
    if (animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(updateLens);
  }, [updateLens]);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isMagnifierEnabled) {
        return;
      }

      pointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };

      scheduleLensUpdate();
    },
    [isMagnifierEnabled, scheduleLensUpdate],
  );

  useEffect(() => {
    if (!isMagnifierEnabled) {
      hideLens();
    }

    return hideLens;
  }, [hideLens, isMagnifierEnabled, previewSrc]);

  const lensStyle = {
    backgroundImage: `url("${previewSrc}")`,
    backgroundRepeat: "no-repeat",
    height: PREVIEW_MAGNIFIER_SIZE_PX,
    imageRendering: "pixelated",
    marginLeft: -(PREVIEW_MAGNIFIER_SIZE_PX / 2),
    marginTop: -(PREVIEW_MAGNIFIER_SIZE_PX / 2),
    width: PREVIEW_MAGNIFIER_SIZE_PX,
  } satisfies CSSProperties;

  return (
    <div
      className={clsx("relative w-full", isMagnifierEnabled && "cursor-none")}
      onPointerCancel={hideLens}
      onPointerLeave={hideLens}
      onPointerMove={handlePointerMove}
    >
      <img
        ref={imageRef}
        src={previewSrc}
        alt="Preview"
        className={clsx(
          "w-full",
          "[image-rendering:pixelated]",
          isMagnifierEnabled && "select-none",
        )}
        draggable={false}
      />
      {isMagnifierEnabled && (
        <div
          ref={lensRef}
          aria-hidden="true"
          className={clsx(
            "pointer-events-none absolute z-20",
            "rounded-full border border-white/70",
            "opacity-0 shadow-lg ring-1 ring-black/25",
            "transition-opacity duration-75",
          )}
          style={lensStyle}
        />
      )}
    </div>
  );
};
