import type { CameraState, CapturePhotoOptions } from "#hooks/user-media/index";

export interface WebcamHandle {
  cameraState: CameraState;
  /** The live camera track, or null before it starts or once it ended. */
  getVideoTrack: () => MediaStreamTrack | null;
  prewarmPhotoCapture: () => Promise<void>;
  takePhoto: (photoSettings?: CapturePhotoOptions) => Promise<Blob>;
}
