import { useUserMedia, type UseUserMediaParams } from "#hooks/user-media/index";
import { cn } from "#lib/utils";
import { type FC, type Ref, useImperativeHandle, useRef } from "react";

import type { WebcamHandle } from "./internal/Webcam.types";

interface WebcamProps {
  className?: string;
  onCameraStateChange?: UseUserMediaParams["onCameraStateChange"];
  onConstraintFallbackError?: UseUserMediaParams["onConstraintFallbackError"];
  ref?: Ref<WebcamHandle>;
  showDebugInfo?: boolean;
  showPreview?: boolean;
}

const formatDebugTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  });

export const Webcam: FC<WebcamProps> = ({
  className,
  onCameraStateChange,
  onConstraintFallbackError,
  ref,
  showDebugInfo = false,
  showPreview = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const { takePhoto, cameraState } = useUserMedia({
    onCameraStateChange,
    onConstraintFallbackError,
    onStream: (stream) => {
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      takePhoto,
      cameraState,
    }),
    [takePhoto, cameraState],
  );

  return (
    <>
      {showDebugInfo && (
        <div className="fixed top-8 right-8 z-10 flex flex-col gap-1 text-sm text-white">
          Camera status: {cameraState.status}
          {cameraState.error && <p>Error: {cameraState.error}</p>}
          <p>Is secure context: {String(cameraState.isSecureContext)}</p>
          {cameraState.lastUpdatedAt && (
            <p>Last updated at: {formatDebugTime(cameraState.lastUpdatedAt)}</p>
          )}
        </div>
      )}
      <video
        ref={videoRef}
        className={cn(
          className,
          "origin-center -scale-x-100",
          !showPreview && "hidden",
        )}
        autoPlay
        playsInline
        muted
      />
    </>
  );
};

export type { WebcamHandle };
