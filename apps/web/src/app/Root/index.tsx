import { WEB_CAMERA_LOG_SOURCE } from "#lib/constants";
import {
  Webcam,
  type WebcamHandle,
} from "@dither-booth/ui/components/misc/Webcam";
import { createUserMediaReporters } from "@dither-booth/ui/lib/hooks/user-media";
import { type FC, useRef } from "react";

const {
  reportUserMediaCameraStateChange,
  reportUserMediaConstraintFallbackError,
} = createUserMediaReporters({ source: WEB_CAMERA_LOG_SOURCE });

export const Root: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);

  return (
    <div className="relative h-dvh bg-black">
      <div className="flex h-full items-center justify-center p-4">
        <Webcam
          showDebugInfo
          showPreview
          ref={webcamRef}
          className="h-full"
          onCameraStateChange={reportUserMediaCameraStateChange}
          onConstraintFallbackError={reportUserMediaConstraintFallbackError}
        />
      </div>
    </div>
  );
};
