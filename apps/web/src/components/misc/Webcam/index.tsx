import { type CameraState, useUserMedia } from "#lib/hooks/user-media/index.ts";
import { cn } from "#lib/utils.ts";
import { format } from "date-fns";
import {
  type FC,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import type { WebcamHandle } from "./internal/Webcam.types.ts";

export type { CameraState };
export type { CameraStatus } from "#lib/hooks/user-media/index.ts";
export type { WebcamHandle };

export const Webcam: FC<{
  className?: string;
  onCameraStateChange?: (state: CameraState) => void;
  ref?: Ref<WebcamHandle>;
  showDebugInfo?: boolean;
  showPreview?: boolean;
}> = (props) => {
  const {
    className,
    onCameraStateChange,
    ref,
    showDebugInfo = false,
    showPreview = true,
  } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCameraStateChangeRef = useRef(onCameraStateChange);
  onCameraStateChangeRef.current = onCameraStateChange;

  const { takePhoto, cameraState } = useUserMedia({
    onStream: (stream) => {
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      cameraState,
      takePhoto,
    }),
    [cameraState, takePhoto],
  );

  useEffect(() => {
    onCameraStateChangeRef.current?.(cameraState);
  }, [cameraState]);

  return (
    <>
      {showDebugInfo && (
        <div className="fixed top-8 right-8 z-50 flex max-w-[min(90vw,22rem)] flex-col gap-1 text-left text-sm text-white">
          Camera status: {cameraState.status}
          {cameraState.error && <p>Error: {cameraState.error}</p>}
          <p>Is secure context: {String(cameraState.isSecureContext)}</p>
          {cameraState.lastUpdatedAt && (
            <p>
              Last updated at:{" "}
              {format(new Date(cameraState.lastUpdatedAt), "HH:mm:ss")}
            </p>
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
