import { useUserMedia } from "@/lib/hooks/user-media";
import { cn } from "@/lib/utils";
import { useImperativeHandle, useRef, type FC, type Ref } from "react";

interface WebcamProps {
  className?: string;

  ref?: Ref<WebcamHandle>;
}

export interface WebcamHandle {
  takePhoto: (photoSettings?: PhotoSettings) => Promise<Blob>;
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
      takePhoto: async (photoSettings?: PhotoSettings) => {
        if (!takePhoto) {
          throw new Error("Camera is not ready yet.");
        }

        return takePhoto(photoSettings);
      },
    }),
    [takePhoto],
  );

  return (
    <video
      ref={videoRef}
      className={cn("aspect-square h-dvh object-cover", className)}
      autoPlay
      playsInline
      muted
    />
  );
};
