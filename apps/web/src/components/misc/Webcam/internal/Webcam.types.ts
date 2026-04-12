import type {
  CameraState,
  CapturePhotoOptions,
} from "#lib/hooks/user-media/index.ts";

export interface WebcamHandle {
  cameraState: CameraState;
  takePhoto: (photoSettings?: CapturePhotoOptions) => Promise<Blob>;
}
