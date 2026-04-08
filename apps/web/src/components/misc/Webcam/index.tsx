import {
  type CapturePhotoOptions,
  useUserMedia,
} from "#lib/hooks/user-media/index.ts";
import { cn } from "#lib/utils.ts";
import { format } from "date-fns";
import { type FC, type Ref, useImperativeHandle, useRef } from "react";

export interface WebcamHandle {
  takePhoto: (photoSettings?: CapturePhotoOptions) => Promise<Blob>;
}

interface WebcamProps {
  className?: string;
  ref?: Ref<WebcamHandle>;
}

export const Webcam: FC<WebcamProps> = ({ className, ref }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const { takePhoto, cameraState } = useUserMedia({
    onStream: (stream) => {
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      takePhoto,
    }),
    [takePhoto],
  );

  return (
    <>
      <div className="fixed top-8 right-8 flex flex-col gap-1 text-sm text-white">
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
      <video
        ref={videoRef}
        className={cn(className)}
        autoPlay
        playsInline
        muted
      />
    </>
  );
};
