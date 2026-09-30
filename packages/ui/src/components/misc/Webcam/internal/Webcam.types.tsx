import type { CameraState, CapturePhotoOptions } from "#hooks/user-media/index";

export interface WebcamHandle {
  cameraState: CameraState;
  prewarmPhotoCapture: () => Promise<void>;
  takePhoto: (photoSettings?: CapturePhotoOptions) => Promise<Blob>;
}
