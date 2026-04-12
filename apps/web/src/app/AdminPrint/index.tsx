import { PrintConfigurationPanel } from "#components/misc/PrintConfigurationPanel/index.tsx";
import { Webcam, type WebcamHandle } from "#components/misc/Webcam/index.tsx";
import type { FC } from "react";
import { useRef } from "react";

export const AdminPrint: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);

  return (
    <div className="grid h-dvh grid-cols-[1fr_420px] bg-background">
      <div className="relative flex items-center justify-center overflow-hidden bg-black">
        <Webcam ref={webcamRef} className="h-full w-full object-cover" />
      </div>
      <PrintConfigurationPanel
        webcamRef={webcamRef}
        onClose={() => {}}
        className="h-dvh rounded-none border-0"
      />
    </div>
  );
};
