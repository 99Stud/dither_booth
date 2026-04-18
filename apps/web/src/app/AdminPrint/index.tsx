import { PrintConfigurationPanel } from "#components/misc/PrintConfigurationPanel/index.tsx";
import {
  Webcam,
  type CameraState,
  type WebcamHandle,
} from "#components/misc/Webcam/index.tsx";
import type { FC } from "react";
import { useRef, useState } from "react";

export const AdminPrint: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);
  const [cameraState, setCameraState] = useState<CameraState | null>(null);

  return (
    <div className="grid h-dvh min-h-0 grid-cols-[1fr_420px] bg-background">
      <div className="relative flex items-center justify-center overflow-hidden bg-black">
        <Webcam
          ref={webcamRef}
          className="h-full w-full object-cover"
          onCameraStateChange={(state: CameraState) => {
            setCameraState(state);
          }}
        />
      </div>
      <div className="flex min-h-0 flex-col">
        <PrintConfigurationPanel
          webcamRef={webcamRef}
          cameraStatus={cameraState?.status ?? "initializing"}
          onClose={() => {}}
          className="min-h-0 flex-1 rounded-none border-0"
        />
      </div>
    </div>
  );
};
