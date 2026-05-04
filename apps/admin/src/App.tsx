import { ADMIN_CAMERA_LOG_SOURCE } from "#lib/constants";
import {
  Webcam,
  type WebcamHandle,
} from "@dither-booth/ui/components/misc/Webcam";
import { createUserMediaReporters } from "@dither-booth/ui/lib/hooks/user-media";
import { useRef, type FC } from "react";

const {
  reportUserMediaCameraStateChange,
  reportUserMediaConstraintFallbackError,
} = createUserMediaReporters({ source: ADMIN_CAMERA_LOG_SOURCE });

const App: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);

  return (
    <Webcam
      showDebugInfo
      showPreview
      ref={webcamRef}
      className="h-full"
      onCameraStateChange={reportUserMediaCameraStateChange}
      onConstraintFallbackError={reportUserMediaConstraintFallbackError}
    />
  );
};

export default App;
