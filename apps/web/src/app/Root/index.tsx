import { type FC, useRef } from "react";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { useUserMedia } from "@/lib/hooks/user-media";

export const Root: FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useUserMedia((stream) => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
  });

  const handlePrint = async () => {
    try {
      await trpc.print.mutate();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <video
        ref={videoRef}
        className="h-dvh w-dvw object-cover"
        autoPlay
        playsInline
        muted
      />
      <div className="fixed top-8 left-8">
        <Button onClick={handlePrint}>Print</Button>
      </div>
    </>
  );
};
