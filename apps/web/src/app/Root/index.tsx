import { useRef, type FC } from "react";

import { Button } from "@/components/ui/button";

import { Webcam, type WebcamHandle } from "@/components/misc/Webcam";
import { downloadBlob } from "@/lib/utils";

export const Root: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);

  const handlePrint = async () => {
    try {
      if (!webcamRef.current) {
        throw new Error("Camera is not available.");
      }

      const photo = await webcamRef.current.takePhoto();
      console.log(photo);
      downloadBlob(photo, Date.now().toString());
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <Webcam ref={webcamRef} />
      <div className="fixed top-8 left-8">
        <Button onClick={handlePrint}>Print</Button>
      </div>
    </>
  );
};
