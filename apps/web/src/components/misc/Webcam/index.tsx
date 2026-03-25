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

  const { takePhoto } = useUserMedia({
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
    <video
      ref={videoRef}
      className={cn(className)}
      autoPlay
      playsInline
      muted
    />
  );
};
