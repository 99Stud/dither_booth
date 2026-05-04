import type { CameraState, CapturePhotoOptions } from "#hooks/user-media/index";

export interface WebcamHandle {
  cameraState: CameraState;
  takePhoto: (photoSettings?: CapturePhotoOptions) => Promise<Blob>;
}
