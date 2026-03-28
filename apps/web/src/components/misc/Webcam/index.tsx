import {
  type CapturePhotoOptions,
  useUserMedia,
} from "#lib/hooks/user-media.ts";
import { cn } from "#lib/utils.ts";
import { type FC, type Ref, useImperativeHandle, useRef } from "react";

interface WebcamProps {
  className?: string;
  ref?: Ref<WebcamHandle>;
}

export interface WebcamHandle {
  takePhoto: (photoSettings?: CapturePhotoOptions) => Promise<Blob>;
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
        <p>Is secure context: true</p>
        <p>Last updated at: {cameraState.lastUpdatedAt}</p>
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
